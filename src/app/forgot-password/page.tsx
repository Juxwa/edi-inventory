"use client";

import { useActionState } from "react";
import Image from "next/image";
import { requestPasswordReset, type ResetRequestState } from "../login/actions";
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

const initialState: ResetRequestState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

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
            <CardTitle className="text-base">Reset password</CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send a reset link.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          {state.done ? (
            <p className="text-center text-sm text-muted-foreground">
              If an account exists for that email, a reset link is on its way.
              Check your inbox.
            </p>
          ) : (
            <form action={formAction} className="grid gap-4" noValidate>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  disabled={pending}
                />
              </div>
              <Button type="submit" className="mt-1 w-full" disabled={pending}>
                {pending ? "Sending..." : "Send reset link"}
              </Button>
            </form>
          )}
          <a
            href="/login"
            className="mt-4 block text-center text-sm font-medium text-primary hover:underline"
          >
            Back to sign in
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
