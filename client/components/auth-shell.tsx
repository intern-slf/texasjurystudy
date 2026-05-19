import { Sparkles, type LucideIcon } from "lucide-react";

type Feature = { icon: LucideIcon; text: string };

interface AuthShellProps {
  tagline?: string;
  title: string;
  accent?: string;
  description?: string;
  features?: Feature[];
  children: React.ReactNode;
  variant?: "split" | "centered";
}

export function AuthShell({
  tagline,
  title,
  accent,
  description,
  features,
  children,
  variant = "split",
}: AuthShellProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Background layers */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-secondary/10 to-background" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
      <div
        className="absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {variant === "centered" ? (
        <div className="flex min-h-[calc(100vh-12rem)] items-center justify-center px-4 py-12">
          <div className="w-full max-w-md mx-auto text-center space-y-6">
            {tagline && (
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                {tagline}
              </div>
            )}
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
              {title}
              {accent && (
                <>
                  {" "}
                  <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {accent}
                  </span>
                </>
              )}
            </h1>
            {description && (
              <p className="text-muted-foreground leading-relaxed">{description}</p>
            )}
            <div className="pt-2 text-left">{children}</div>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-12rem)] px-4 py-12 md:py-16 max-w-6xl mx-auto">
          {/* Brand panel — desktop only */}
          <div className="hidden lg:block space-y-6">
            {tagline && (
              <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5 mr-2" />
                {tagline}
              </div>
            )}
            <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl leading-[1.1]">
              {title}
              {accent && (
                <>
                  <br />
                  <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                    {accent}
                  </span>
                </>
              )}
            </h1>
            {description && (
              <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>
            )}
            {features && features.length > 0 && (
              <ul className="space-y-4 pt-2">
                {features.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <div className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-muted-foreground pt-1.5">{f.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Form panel */}
          <div className="w-full max-w-md mx-auto lg:mx-0 lg:ml-auto">
            <div className="lg:hidden mb-6 text-center space-y-2">
              {tagline && (
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  {tagline}
                </div>
              )}
              <h1 className="text-2xl font-extrabold tracking-tight">
                {title}
                {accent && (
                  <>
                    {" "}
                    <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                      {accent}
                    </span>
                  </>
                )}
              </h1>
              {description && (
                <p className="text-sm text-muted-foreground">{description}</p>
              )}
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
