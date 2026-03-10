/**
 * Client-side Google OAuth via Google Identity Services (GIS).
 *
 * Uses the OAuth 2.0 implicit grant flow to obtain an access token
 * with `cloud-platform` scope directly in the browser.
 * No server required – works on static sites / GitHub Pages.
 *
 * The caller must supply a Google OAuth Client ID
 * (created in Google Cloud Console with "Web application" type
 *  and the site's origin added to Authorized JavaScript origins).
 */

const TOKEN_STORAGE_KEY = 'svg-studio-oauth-token';

export interface OAuthToken {
  accessToken: string;
  expiresAt: number; // epoch ms
  email?: string;
}

/** Persist token to sessionStorage (cleared when tab closes). */
function saveToken(token: OAuthToken) {
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
  } catch { /* ignore */ }
}

/** Load previously saved token if still valid. */
export function loadToken(): OAuthToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const token: OAuthToken = JSON.parse(raw);
    if (Date.now() >= token.expiresAt - 60_000) return null; // expired (with 1 min buffer)
    return token;
  } catch {
    return null;
  }
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
}

/**
 * Kick off the Google OAuth implicit flow via a popup window.
 * Returns a promise that resolves with the access token.
 */
export function signInWithGoogle(clientId: string): Promise<OAuthToken> {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('OAuth Client ID is required'));
      return;
    }

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = 'openid email https://www.googleapis.com/auth/cloud-platform';
    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope,
      state,
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      authUrl,
      'google-oauth',
      `width=${width},height=${height},left=${left},top=${top},popup=1`,
    );

    if (!popup) {
      reject(new Error('Popup blocked – please allow popups for this site'));
      return;
    }

    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          reject(new Error('Sign-in cancelled'));
          return;
        }

        // Check if the popup has navigated back to our origin
        const popupUrl = popup.location.href;
        if (!popupUrl.startsWith(redirectUri)) return;

        // Parse the hash fragment
        const hash = popup.location.hash.substring(1);
        popup.close();
        clearInterval(interval);

        const fragParams = new URLSearchParams(hash);
        const accessToken = fragParams.get('access_token');
        const expiresIn = parseInt(fragParams.get('expires_in') || '3600', 10);
        const returnedState = fragParams.get('state');

        if (returnedState !== state) {
          reject(new Error('OAuth state mismatch – possible CSRF'));
          return;
        }

        if (!accessToken) {
          const error = fragParams.get('error') || 'No access token returned';
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        const token: OAuthToken = {
          accessToken,
          expiresAt: Date.now() + expiresIn * 1000,
        };

        // Fetch user info to get email
        fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
          .then((r) => r.json())
          .then((info) => {
            token.email = info.email;
            saveToken(token);
            resolve(token);
          })
          .catch(() => {
            // Still usable without email
            saveToken(token);
            resolve(token);
          });
      } catch {
        // Cross-origin access will throw – ignore until popup navigates back
      }
    }, 200);
  });
}
