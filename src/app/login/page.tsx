"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { signIn, type SignInState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const initialState: SignInState = {};

function UrlErrorNotice() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  if (!urlError) return null;
  return (
    <p role="alert" className="mb-3 text-sm font-medium text-destructive">
      {urlError}
    </p>
  );
}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

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
            <CardTitle className="text-base">Inventory System</CardTitle>
            <CardDescription>Sign in to continue</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <Suspense fallback={null}>
            <UrlErrorNotice />
          </Suspense>
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
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                disabled={pending}
              />
            </div>
            {state?.error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" className="mt-1 w-full" disabled={pending}>
              {pending ? "Signing in..." : "Sign in"}
            </Button>
            <a
              href="/forgot-password"
              className="text-center text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </a>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
