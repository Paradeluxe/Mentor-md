/**
 * e2e: Mentor Doctor + disk-path bind + AI preflight (Playwright against live :8787)
 * Run (server must be up via mentor.cmd / mentor-server.py):
 *   npx playwright test tests/e2e-doctor-path-ai.spec.js --reporter=line
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const BASE = process.env.MENTOR_BASE || "http://127.0.0.1:8787";
const DEMO = path.resolve(__dirname, "../examples/supervision-pet-demo.mentor");

async function api(request, method, route, body) {
  const session = await request.get(BASE + "/session");
  const { token } = await session.json();
  const res = await request[method](BASE + route, {
    data: body ? { token, ...body } : undefined,
    headers: body ? { "Content-Type": "application/json" } : undefined,
  });
  return { token, res, json: await res.json().catch(() => ({})) };
}

test.describe("Doctor + path + AI gate", () => {
  test.beforeAll(async () => {
    expect(fs.existsSync(DEMO)).toBeTruthy();
  });

  test("API doctor overall ok + pick-mentor direct path", async ({ request }) => {
    const doc = await request.get(BASE + "/doctor?warm=1&wait=12");
    expect(doc.ok()).toBeTruthy();
    const d = await doc.json();
    expect(d.overall === "ok" || d.overall === "warn").toBeTruthy();
    const worker = (d.checks || []).find((c) => c.id === "warm-worker");
    expect(worker?.ok).toBeTruthy();

    const { res, json } = await api(request, "post", "/pick-mentor", { path: DEMO });
    expect(res.ok()).toBeTruthy();
    expect(json.ok).toBeTruthy();
    expect(String(json.path).toLowerCase()).toContain("supervision-pet-demo.mentor");
  });

  test("browser: path bind + ensureDisk + hermes chip doctor", async ({ page, request }) => {
    await api(request, "post", "/pending-open", { path: DEMO });
    await page.goto(BASE + "/index.html?v=e2e-doctor", { waitUntil: "load" });
    await page.waitForFunction(() => {
      const t = document.getElementById("hermes-conn-status-text")?.textContent || "";
      return t.includes("就绪");
    }, null, { timeout: 45000 });

    const report = await page.evaluate(async () => {
      const a = window.__mdAnnotator;
      // wait abs path from pending-open
      for (let i = 0; i < 40; i++) {
        const p = a.resolveActiveMentorAbsPath?.() || "";
        if (p) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      const doctor = await a.fetchDoctorReport({ warm: true, wait: 8 });
      const saved = await a.ensureDiskSavedForFixMentor();
      a.__testSetMentorDiskPath("");
      const cleared = await a.fetchDoctorReport({ warm: false, wait: 0 });
      const bind = await a.pickAndBindMentorPath({
        path: "E:/hermes_playground/Mentor/examples/supervision-pet-demo.mentor",
        name: "supervision-pet-demo.mentor",
      });
      const saved2 = await a.ensureDiskSavedForFixMentor();
      return { doctor, saved, cleared, bind, saved2 };
    });

    expect(report.saved.ok).toBeTruthy();
    expect(report.cleared.overall === "warn" || report.cleared.overall === "ok").toBeTruthy();
    const diskCleared = (report.cleared.checks || []).find((c) => c.id === "disk-path");
    expect(diskCleared?.ok).toBeFalsy();
    expect(report.bind.ok).toBeTruthy();
    expect(report.saved2.ok).toBeTruthy();

    await page.click("#hermes-conn-status");
    await expect(page.locator("#doctor-modal")).not.toHaveClass(/hidden/);
  });
});
