/**
 * 把 CLI 打包成 dist/pi-bridge.tgz，供 npm install -g <地址> 安装。
 *
 * Node 不会对 node_modules 里的 TypeScript 去除类型，所以发布前用 esbuild 打包成一个 JavaScript 文件；
 * Pi 的 SDK 仍作为依赖由 npm 安装。版本号取自 package.json，发布时由 CI 按标签写入。
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";
import pkg from "./package.json" with { type: "json" };

const root = import.meta.dirname;
const dist = join(root, "dist");
const stage = join(dist, "package");

rmSync(dist, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

await build({
	entryPoints: [join(root, "src", "main.ts")],
	outfile: join(stage, "main.js"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	packages: "external",
	legalComments: "none",
});

writeFileSync(
	join(stage, "package.json"),
	`${JSON.stringify(
		{
			name: pkg.name,
			version: pkg.version,
			description: pkg.description,
			license: pkg.license,
			type: "module",
			bin: { "pi-bridge": "main.js" },
			engines: pkg.engines,
			dependencies: pkg.dependencies,
		},
		null,
		"\t",
	)}\n`,
);
copyFileSync(join(root, "..", "..", "LICENSE"), join(stage, "LICENSE"));

const tarball = execFileSync(
	"npm",
	["pack", "--silent", "--pack-destination", dist],
	{
		cwd: stage,
		encoding: "utf8",
	},
).trim();
const output = join(dist, "pi-bridge.tgz");
copyFileSync(join(dist, tarball), output);
rmSync(join(dist, tarball));
console.log(`已生成 ${output}（版本 ${pkg.version}）`);
