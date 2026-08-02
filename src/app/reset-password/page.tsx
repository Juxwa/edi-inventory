"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { clearMustChangePassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Doubles as invite acceptance: invite and recovery email links both land
// here with a session already established by /auth/confirm.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password === "edi2026") {
      setError("Choose a password different from your temporary password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(
        updateError.message ||
          "Could not set the password. The link may have expired — request a new one.",
      );
      setPending(false);
      return;
    }
    await clearMustChangePassword();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center gap-3 pb-2 pt-6 text-center">
          <Image
            src="/edi-logo.png"
            alt="Ear Diagnostics Inc."
            width={160}
            height={40}
            priority
            className="h-8 w-auto"
          />
          <div className="space-y-1">
            <CardTitle className="text-base">Set your password</CardTitle>
            <CardDescription>
              Choose a new password for your account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setPassword(event.target.value)
                }
                required
                disabled={pending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setConfirm(event.target.value)
                }
                required
                disabled={pending}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="mt-1 w-full" disabled={pending}>
              {pending ? "Saving..." : "Set password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
