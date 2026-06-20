/**
 * WebAuthn Client Helper using native browser APIs.
 */

// Helper: Convert base64url string to ArrayBuffer
export function base64urlToBuffer(base64url: string): ArrayBuffer {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Helper: Convert ArrayBuffer to base64url string
export function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = window.btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper: Convert ArrayBuffer to base64 string
export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Registers a new Passkey credential for the user.
 */
export async function registerPasskey(userId: string): Promise<any> {
  // 1. Get registration options from server
  const res = await fetch(`/api/auth/webauthn?action=generate-registration-options&userId=${userId}`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to generate registration options');
  }

  const options = await res.json();

  // 2. Prepare options for navigator.credentials.create
  options.challenge = base64urlToBuffer(options.challenge);
  options.user.id = base64urlToBuffer(options.user.id);

  if (options.excludeCredentials) {
    options.excludeCredentials = options.excludeCredentials.map((cred: any) => ({
      ...cred,
      id: base64urlToBuffer(cred.id)
    }));
  }

  // 3. Trigger native WebAuthn Registration
  const credential = await navigator.credentials.create({
    publicKey: options
  }) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Credential creation failed');
  }

  const response = credential.response as AuthenticatorAttestationResponse;

  // 4. Construct payload for server verification
  const verifyBody = {
    action: 'verify-registration',
    userId,
    response: {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      response: {
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        attestationObject: bufferToBase64url(response.attestationObject),
        transports: typeof response.getTransports === 'function' ? response.getTransports() : ['internal', 'hybrid']
      }
    }
  };

  // 5. Send to server to verify and save
  const verifyRes = await fetch('/api/auth/webauthn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyBody)
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.verified) {
    throw new Error(verifyData.error || 'Passkey registration verification failed');
  }

  return verifyData;
}

/**
 * Authenticates the user using an existing Passkey credential.
 */
export async function authenticatePasskey(userId: string): Promise<boolean> {
  // 1. Get authentication options from server
  const res = await fetch(`/api/auth/webauthn?action=generate-authentication-options&userId=${userId}`);
  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(errorData.error || 'Failed to generate authentication options');
  }

  const options = await res.json();

  // 2. Prepare options for navigator.credentials.get
  options.challenge = base64urlToBuffer(options.challenge);

  if (options.allowCredentials) {
    options.allowCredentials = options.allowCredentials.map((cred: any) => ({
      ...cred,
      id: base64urlToBuffer(cred.id)
    }));
  }

  // 3. Trigger native WebAuthn Authentication
  const credential = await navigator.credentials.get({
    publicKey: options
  }) as PublicKeyCredential;

  if (!credential) {
    throw new Error('Authentication failed');
  }

  const response = credential.response as AuthenticatorAssertionResponse;

  // 4. Construct payload for server verification
  const verifyBody = {
    action: 'verify-authentication',
    userId,
    response: {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
        authenticatorData: bufferToBase64url(response.authenticatorData),
        signature: bufferToBase64url(response.signature),
        userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined
      }
    }
  };

  // 5. Send to server to verify
  const verifyRes = await fetch('/api/auth/webauthn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(verifyBody)
  });

  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.verified) {
    throw new Error(verifyData.error || 'Passkey authentication verification failed');
  }

  return true;
}
