export interface WorkflowRoutableProject {
    workflow_mode?: string;
    series_id?: string;
}

/**
 * Series episodes use the unified editor because reconciliation and the
 * series-shared asset flow lead into Cast. New API projects may still carry
 * the legacy generation flag (`i2v_legacy`), so series membership is the
 * reliable UI-routing signal. Standalone legacy projects keep their original
 * six-step editor.
 */
export function usesUnifiedProjectFlow(
    project: WorkflowRoutableProject | null | undefined,
): boolean {
    return project?.workflow_mode === "r2v" || Boolean(project?.series_id);
}
