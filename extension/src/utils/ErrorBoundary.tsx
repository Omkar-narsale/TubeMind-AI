import { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error inside TubeMind extension:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[300px] items-center justify-center p-4">
          <Card className="w-full max-w-md border-destructive/50">
            <CardHeader>
              <CardTitle className="text-destructive">Application Error</CardTitle>
              <CardDescription>
                Something went wrong rendering this component.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded bg-muted p-3 text-xs font-mono text-muted-foreground break-all max-h-40 overflow-y-auto">
                {this.state.error?.toString() || "Unknown error occurred"}
              </div>
              <Button onClick={this.handleReset} className="w-full" variant="outline">
                Reload Component
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
