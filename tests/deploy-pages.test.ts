/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import workflow from "../.github/workflows/deploy-pages.yml?raw";

describe("GitHub Pages deployment workflow", () => {
  it("uses the older Pages artifact upload protocol before deployment", () => {
    expect(workflow).toMatch(
      /uses: actions\/upload-pages-artifact@v4\s+with:\s+path: dist\s+- name: Deploy\s+id: deployment\s+uses: actions\/deploy-pages@v5/,
    );
  });
});
