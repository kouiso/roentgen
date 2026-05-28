import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

type ErrorBoundaryProps = {
	children: ReactNode;
	onReset?: () => void;
};

type ErrorBoundaryState = {
	hasError: boolean;
	error: Error | null;
	componentStack: string | null;
	copyStatus: "idle" | "copied" | "failed";
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
		componentStack: null,
		copyStatus: "idle",
	};

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error, componentStack: null, copyStatus: "idle" };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error("[ErrorBoundary]", error, errorInfo);
		const componentStack = errorInfo.componentStack ?? null;
		this.setState({ componentStack });

		const crashReporter: CrashReporterForwarder | undefined =
			window.electronAPI?.crashReporter;
		void crashReporter?.captureException?.(error, errorInfo);
		void crashReporter?.reportError?.({
			message: error.message,
			stack: error.stack,
			componentStack: componentStack ?? undefined,
		});
	}

	private getDiagnosticDetails = (): string => {
		const error = this.state.error;
		const message = error?.message ?? "不明なエラー";
		const details = [
			"Roentgen ErrorBoundary diagnostics",
			`Message: ${message}`,
			error?.stack ? `Stack:\n${error.stack}` : null,
			this.state.componentStack
				? `Component stack:\n${this.state.componentStack.trim()}`
				: null,
		];

		return details
			.filter((detail): detail is string => Boolean(detail))
			.join("\n\n");
	};

	private handleCopyDetails = async (): Promise<void> => {
		try {
			if (!navigator.clipboard?.writeText) {
				throw new Error("Clipboard API is unavailable");
			}

			await navigator.clipboard.writeText(this.getDiagnosticDetails());
			this.setState({ copyStatus: "copied" });
		} catch {
			this.setState({ copyStatus: "failed" });
		}
	};

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
					<div className="flex flex-wrap gap-2">
						<button
							type="button"
							onClick={this.handleCopyDetails}
							className="chip w-fit text-zinc-100 hover:border-sky-400/30 hover:text-sky-300"
						>
							詳細をコピー
						</button>
						<button
							type="button"
							onClick={this.handleReset}
							className="chip w-fit text-zinc-100 hover:border-sky-400/30 hover:text-sky-300"
						>
							再読み込み
						</button>
					</div>
					<p className="min-h-5 text-xs text-zinc-400" role="status">
						{this.state.copyStatus === "copied"
							? "エラー詳細をクリップボードにコピーしました"
							: null}
						{this.state.copyStatus === "failed"
							? "エラー詳細をコピーできませんでした"
							: null}
					</p>
				</section>
			</div>
		);
	}
}
