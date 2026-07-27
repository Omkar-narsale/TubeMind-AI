import { Skeleton } from "@/components/ui/skeleton";

interface LoadingProps {
  variant?: "spinner" | "skeleton" | "text";
  message?: string;
  className?: string;
}

export function Loading({ variant = "spinner", message = "Loading...", className = "" }: LoadingProps) {
  if (variant === "skeleton") {
    return (
      <div className={`space-y-3 p-4 w-full ${className}`}>
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (variant === "text") {
    return (
      <div className={`flex items-center justify-center p-4 text-sm text-muted-foreground ${className}`}>
        <span className="animate-pulse">{message}</span>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center p-6 space-y-2 ${className}`}>
      <svg
        className="animate-spin h-8 w-8 text-primary"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        data-testid="loading-spinner"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

export default Loading;
