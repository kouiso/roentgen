import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

type ErrorBoundaryProps = {
	children: ReactNode;
	onReset?: () => void;
};

type ErrorBoundaryState = {
	hasError: boolean;
	error: Error | null;
};

type CrashReporterForwarder = ElectronAPI["crashReporter"] & {
	captureException?: (
		error: Error,
		errorInfo: ErrorInfo,
	) => void | Promise<void>;
	reportError?: (payload: {
		message: string;
		stack?: string;
		componentStack?: string;
	}) => void | Promise<void>;
};

export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = {
		hasError: false,
		error: null,
	};

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("[ErrorBoundary]", error, errorInfo);

		const crashReporter: CrashReporterForwarder | undefined =
			window.electronAPI?.crashReporter;
		void crashReporter?.captureException?.(error, errorInfo);
		void crashReporter?.reportError?.({
			message: error.message,
			stack: error.stack,
			componentStack: errorInfo.componentStack ?? undefined,
		});
	}

	private handleReset = (): void => {
		this.props.onReset?.();
		window.location.reload();
	};

	render() {
		if (!this.state.hasError) {
			return this.props.children;
		}

		return (
			<div className="flex min-h-0 flex-1 items-center justify-center bg-app px-6">
				<section className="panel-surface flex w-full max-w-md flex-col gap-4 rounded-lg border border-white/[0.08] p-6">
					<div className="space-y-2">
						<h2 className="text-[15px] font-semibold text-zinc-100">
							ビューアでエラーが発生しました
						</h2>
						<p className="break-words font-mono text-xs leading-5 text-rose-300">
							{this.state.error?.message ?? "不明なエラー"}
						</p>
					</div>
					<button
						type="button"
						onClick={this.handleReset}
						className="chip w-fit text-zinc-100 hover:border-sky-400/30 hover:text-sky-300"
					>
						再読み込み
					</button>
				</section>
			</div>
		);
	}
}
