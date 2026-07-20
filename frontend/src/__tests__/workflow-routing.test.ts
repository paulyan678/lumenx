import { describe, expect, it } from "vitest";

import { usesUnifiedProjectFlow } from "@/lib/workflowRouting";

describe("usesUnifiedProjectFlow", () => {
    it("routes a series episode with the legacy generation flag through Cast", () => {
        expect(usesUnifiedProjectFlow({
            workflow_mode: "i2v_legacy",
            series_id: "series-1",
        })).toBe(true);
    });

    it("keeps an old standalone legacy project on the legacy steps", () => {
        expect(usesUnifiedProjectFlow({ workflow_mode: "i2v_legacy" })).toBe(false);
    });

    it("keeps explicit r2v projects on the unified steps", () => {
        expect(usesUnifiedProjectFlow({ workflow_mode: "r2v" })).toBe(true);
    });
});
