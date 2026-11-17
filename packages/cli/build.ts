/**
 * 把 CLI 打包到 dist/package，发布时在这个目录运行 npm publish。
 *
 * Node 不会对 node_modules 里的 TypeScript 去除类型，所以发布前用 esbuild 打包成一个 JavaScript 文件。
 * 运行时加载用户电脑上已安装的 Pi，安装包不包含 Pi，也没有其他依赖。
 */
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
			homepage: pkg.homepage,
			repository: pkg.repository,
			type: "module",
			bin: { "pi-bridge": "main.js" },
			engines: pkg.engines,
		},
		null,
		"\t",
	)}\n`,
);
copyFileSync(join(root, "..", "..", "LICENSE"), join(stage, "LICENSE"));
copyFileSync(join(root, "..", "..", "README.md"), join(stage, "README.md"));
console.log(`已生成 ${stage}（${pkg.name} ${pkg.version}）`);
