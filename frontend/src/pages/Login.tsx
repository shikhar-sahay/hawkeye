"use client";

import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Key, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { apiClient, ApiError } from "@/api/client";
import { setStoredApiKey, hasUserApiKey, clearStoredApiKey } from "@/auth";

/**
 * LoginPage - API key sign-in for the Hawkeye dashboard.
 *
 * Hawkeye authenticates sources with API keys rather than usernames and
 * passwords. A dashboard user signs in with one of their source's active
 * API keys (created on the Sources page / via the backend API).
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string; message?: string } };
  const from = location.state?.from || "/";

  // Already signed in on this browser - go straight to the app
  React.useEffect(() => {
    if (hasUserApiKey()) {
      navigate(from, { replace: true });
    }
  }, [navigate, from]);

  const [apiKeyInput, setApiKeyInput] = React.useState("");
  const [showKey, setShowKey] = React.useState(false);
  const [isSigningIn, setIsSigningIn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(location.state?.message ?? null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = apiKeyInput.trim();
    if (!key) {
      setError("Please enter your API key.");
      return;
    }

    setIsSigningIn(true);
    setError(null);

    // Reject any previously stored invalid key before validating
    clearStoredApiKey();

    try {
      // Temporarily store so the API client picks it up during validation
      setStoredApiKey(key);
      await apiClient.getSources(1, 0);
      // Key is valid - go to the requested page or the dashboard
      navigate(from, { replace: true });
    } catch (err) {
      clearStoredApiKey();
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setError("Invalid or inactive API key. Check the key and try again.");
      } else if (err instanceof TypeError) {
        setError(
          "Could not reach the Hawkeye backend. Make sure the server is running, then try again."
        );
        // Network failure is not an auth problem - restore the entered key
        setStoredApiKey(key);
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed. Please try again.");
        clearStoredApiKey();
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo size={48} />
          <h1 className="text-3xl font-bold tracking-tight">Hawkeye</h1>
          <p className="text-muted-foreground text-sm">
            Sign in to your security monitoring dashboard
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Sign In
            </CardTitle>
            <CardDescription>
              Hawkeye uses source API keys for authentication. Create one on the
              Sources page of a registered source, then paste it below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-api-key">API Key</Label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    id="login-api-key"
                    type={showKey ? "text" : "password"}
                    placeholder="hawk_..."
                    value={apiKeyInput}
                    onChange={(e) => {
                      setApiKeyInput(e.target.value);
                      setError(null);
                    }}
                    className="pl-10 pr-10"
                    autoComplete="off"
                    autoFocus
                    disabled={isSigningIn}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowKey(!showKey)}
                    aria-label={showKey ? "Hide API key" : "Show API key"}
                    tabIndex={-1}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {error && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
                    <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={isSigningIn || !apiKeyInput.trim()}>
                {isSigningIn ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>

            <p className="mt-4 text-xs text-muted-foreground">
              Your API key is stored only in this browser (localStorage) and sent as
              an X-API-Key header with every request. Sign out at any time to remove it.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
