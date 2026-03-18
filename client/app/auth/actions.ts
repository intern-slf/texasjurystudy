'use server';

import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendEmail, emailWrapper } from '@/lib/mail';
import { redirect } from 'next/navigation';

export async function signupWithCustomEmail(formData: FormData) {
    try {
        const email = formData.get('email') as string;
        const password = formData.get('password') as string;
        const role = formData.get('role') as string;
        const origin = formData.get('origin') as string;

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

        // MANUALLY INSERT ROLE INTO public.roles TABLE
        const { error: roleError } = await supabaseAdmin
            .from('roles')
            .insert({ user_id: userCreatedData.user.id, role, email });

        if (roleError) {
            console.error("Failed to insert role:", JSON.stringify(roleError));
            return { error: `Failed to assign role: ${roleError.message}` };
        }

        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'signup',
            email,
            password,
            options: {
                redirectTo: `${origin}/auth/callback`
            }
        });

        if (linkError) {
            return { error: linkError.message };
        }

        const { properties } = linkData;
        const verificationLink = properties.action_link;

        await sendEmail({
            to: email,
            subject: 'Confirm Your Account | Texas Jury Study',
            html: emailWrapper(`
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;text-align:center;">Confirm Your Account</h2>
              <p style="margin:0 0 20px;font-size:15px;color:#475569;">
                Thank you for registering with the Texas Jury Study. Please verify your email address to activate your account.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:6px;background-color:#2563eb;">
                    <a href="${verificationLink}"
                       style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                      Confirm Account
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-size:13px;color:#94a3b8;">
                If you did not create an account, you can safely ignore this email.
              </p>
            `),
        });

        return { success: true };
    } catch (error: any) {
        console.error("Signup Error:", error);
        return { error: error.message || "Internal Server Error during signup" };
    }
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
        subject: 'Password Reset Request | Texas Jury Study',
        html: emailWrapper(`
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1e3a8a;">Password Reset Request</h2>
          <p style="margin:0 0 20px;font-size:15px;color:#475569;">
            We received a request to reset the password for your Texas Jury Study account. Click the button below to choose a new password.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td style="border-radius:6px;background-color:#2563eb;">
                <a href="${resetLink}"
                   style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                  Reset Password
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
            This link will expire shortly for your security.
          </p>
          <p style="margin:0;font-size:13px;color:#94a3b8;">
            If you did not request a password reset, no action is needed — your account remains secure.
          </p>
        `),
    });

    return { success: true };
}
