/**
 * Mentor fix-mentor sandbox extension for Pi.
 *
 * Blocks write/edit outside process.cwd() (parent of the open .mentor) and
 * inside the skill install tree. Allows .mentor packages and supervision
 * sidecars next to the file.
 *
 * Load with:
 *   pi --mode rpc --no-extensions -e <this-file> --skill <skill> --session-dir <parent>
 * cwd must be the parent directory of the .mentor file.
 *
 * Host injects MENTOR_SKILL_DIR when spawning Pi RPC.
 */
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function isUnder(root: string, target: string): boolean {
	const r = path.resolve(root);
	const t = path.resolve(target);
	const rel = path.relative(r, t);
	return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function isAllowedMentorArtifact(base: string): boolean {
	const b = base.toLowerCase();
	if (b.endsWith(".mentor")) return true;
	if (b.endsWith(".mentor.supervision.json")) return true;
	if (b === ".supervision-index.json") return true;
	if (b === ".mentor-pending-open.json") return true;
	if (b === ".mentor-session") return true;
	// temp writes during mentor_io
	if (b.endsWith(".tmp") || b.endsWith(".bak")) return true;
	return false;
}

export default function (pi: ExtensionAPI) {
	const projectRoot = path.resolve(process.cwd());
	const skillEnv =
		process.env.MENTOR_SKILL_DIR ||
		process.env.MENTOR_SKILL_ROOT ||
		"";
	const skillRoot = skillEnv ? path.resolve(skillEnv) : "";

	pi.on("tool_call", async (event) => {
		if (event.toolName !== "write" && event.toolName !== "edit") {
			return undefined;
		}
		const raw = (event.input as { path?: string })?.path;
		if (!raw || typeof raw !== "string") {
			return { block: true, reason: "write/edit missing path" };
		}
		const target = path.isAbsolute(raw)
			? path.resolve(raw)
			: path.resolve(projectRoot, raw);

		if (!isUnder(projectRoot, target)) {
			return {
				block: true,
				reason: `Path "${raw}" is outside project root ${projectRoot}`,
			};
		}
		if (skillRoot && isUnder(skillRoot, target)) {
			return {
				block: true,
				reason: `Path "${raw}" is inside read-only skill tree`,
			};
		}
		const base = path.basename(target);
		const baseLower = base.toLowerCase();
		if (
			baseLower === ".env" ||
			baseLower.endsWith(".pem") ||
			baseLower.includes("credential") ||
			baseLower.includes("secret")
		) {
			return { block: true, reason: `Path "${raw}" is protected` };
		}
		// Prefer mentor artifacts; still allow other project-local writes
		// (content extraction, media) under cwd — skill SOP uses mentor_io.
		void isAllowedMentorArtifact;
		return undefined;
	});
}
