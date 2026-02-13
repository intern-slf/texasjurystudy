'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/mailer';
import { redirect } from 'next/navigation';

export async function signupWithCustomEmail(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as string;
    const origin = formData.get('origin') as string;

    // 1. Create user using Admin API (to avoid auto-sending Supabase emails if possible, though disabling in dashboard is best)
    // We use admin.createUser to create the user.
    // Note: If email confirmation is enabled in Supabase, this might still trigger an email depending on settings.
    // Best practice: Disable "Enable email confirmations" in Supabase dashboard to strictly use this custom flow,
    // OR use `autoConfirm: true` and manage your own "verified" state if you want to bypass Supabase's built-in email entirely.
    // However, we want to start a flow where user NEEDS to verify.

    // Actually, to get a *verification link* from Supabase, the user must exist.
    // If we want to send the link OURSELVES, we use `generateLink`.

    // Strategy:
    // 1. Check if user exists.
    // 2. If not, create user (without email confirmation if possible, or just standard create).
    // 3. Generate 'signup' link.
    // 4. Send email.

    const { data: userCreatedData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false, // User is not confirmed yet
        user_metadata: { role },
    });

    if (createError) {
        if (createError.message.includes("User already registered")) {
            return { error: "User already registered" };
        }
        return { error: createError.message };
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email,
        password,
        options: {
            redirectTo: `${origin}/auth/callback` // Standard callback to handle session exchange
        }
    });

    if (linkError) {
        return { error: linkError.message };
    }

    const { user, properties } = linkData;

    // properties.action_link contains the verification URL
    const verificationLink = properties.action_link;

    await sendEmail({
        to: email,
        subject: 'Confirm your account | Texas Jury Study',
        html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Welcome to Texas Jury Study!</h2>
        <p>Please confirm your account by clicking the link below:</p>
        <a href="${verificationLink}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Confirm Account</a>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
    });

    return { success: true };
}

export async function resetPasswordWithCustomEmail(formData: FormData) {
    const email = formData.get('email') as string;
    const origin = formData.get('origin') as string;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
            redirectTo: `${origin}/auth/update-password`
        }
    });

    if (linkError) {
        return { error: linkError.message };
    }

    const { properties } = linkData;
    const resetLink = properties.action_link;

    await sendEmail({
        to: email,
        subject: 'Reset your password | Texas Jury Study',
        html: `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Reset Password Request</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}" style="padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>If you did not request this, please ignore this email.</p>
      </div>
    `,
    });

    return { success: true };
}
