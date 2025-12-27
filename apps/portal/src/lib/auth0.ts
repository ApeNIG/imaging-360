import { Auth0Client, type Auth0ClientOptions } from '@auth0/auth0-spa-js';

// Environment variables for Auth0 configuration
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;
const AUTH0_AUDIENCE = import.meta.env.VITE_AUTH0_AUDIENCE;

// Singleton Auth0 client instance
let auth0Client: Auth0Client | null = null;

/**
 * Check if Auth0 is configured via environment variables
 */
export function isAuth0Configured(): boolean {
  return Boolean(AUTH0_DOMAIN && AUTH0_CLIENT_ID);
}

/**
 * Get or initialize the Auth0 client
 */
export async function getAuth0Client(): Promise<Auth0Client> {
  if (!isAuth0Configured()) {
    throw new Error('Auth0 is not configured. Set VITE_AUTH0_DOMAIN and VITE_AUTH0_CLIENT_ID.');
  }

  if (!auth0Client) {
    const config: Auth0ClientOptions = {
      domain: AUTH0_DOMAIN!,
      clientId: AUTH0_CLIENT_ID!,
      authorizationParams: {
        redirect_uri: `${window.location.origin}/callback`,
        ...(AUTH0_AUDIENCE && { audience: AUTH0_AUDIENCE }),
      },
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
    };

    auth0Client = new Auth0Client(config);
  }

  return auth0Client;
}

/**
 * Redirect to Auth0 login page
 */
export async function loginWithRedirect(): Promise<void> {
  const client = await getAuth0Client();
  await client.loginWithRedirect();
}

/**
 * Handle the callback from Auth0 after login
 * Returns the ID token for backend verification
 */
export async function handleRedirectCallback(): Promise<{ idToken: string }> {
  const client = await getAuth0Client();

  // Process the callback
  await client.handleRedirectCallback();

  // Get the ID token claims
  const claims = await client.getIdTokenClaims();

  if (!claims || !claims.__raw) {
    throw new Error('Failed to get ID token from Auth0');
  }

  return { idToken: claims.__raw };
}

/**
 * Check if there's an Auth0 callback in the URL
 */
export function hasAuthCallback(): boolean {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.has('code') && searchParams.has('state');
}

/**
 * Logout from Auth0
 */
export async function logout(): Promise<void> {
  if (!isAuth0Configured()) {
    return;
  }

  try {
    const client = await getAuth0Client();
    await client.logout({
      logoutParams: {
        returnTo: `${window.location.origin}/login`,
      },
    });
  } catch (error) {
    console.error('Auth0 logout error:', error);
  }
}

/**
 * Check if user is authenticated with Auth0
 */
export async function isAuthenticated(): Promise<boolean> {
  if (!isAuth0Configured()) {
    return false;
  }

  try {
    const client = await getAuth0Client();
    return await client.isAuthenticated();
  } catch {
    return false;
  }
}
