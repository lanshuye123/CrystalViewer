# CrystalViewer · 空间群晶胞查看器

一个纯前端的空间群晶胞查看工具：输入空间群编号或 Hermann-Mauguin 符号，即可生成并浏览对应的 3D 晶胞模型，同时以表格呈现 Wyckoff 位置与原子点位信息。

- 需求文档：[`docs/功能需求文档.md`](docs/功能需求文档.md)
- 实施规划：[`docs/实施规划.md`](docs/实施规划.md)

## 技术栈

- Vue 3（Composition API）+ TypeScript
- Vite（构建）+ Pinia（状态）+ Element Plus（UI）+ Three.js（3D）
- Vitest（单元测试）+ ESLint / Oxlint / Prettier（代码质量）
- 包管理器：yarn

## MVP 范围

| 模块 | 内容 |
|------|------|
| F1 空间群查询与解析 | 编号 / H-M 符号输入、晶系筛选、相似建议、信息卡片 |
| F2 晶胞 3D 展示 | 晶胞线框（a/b/c 轴配色与标注）、原子球体、等效位置生成 |
| F3 原子点位表格 | Wyckoff 字母 / 多重度 / 位置对称性 / 代表坐标 / 等效坐标，排序、展开、复制、3D 联动 |
| F4 3D 交互 | 旋转 / 缩放 / 平移、自动旋转、重置视角、坐标拾取 |
| F5 显示设置 | 晶胞边框、原子标签、原子半径、模型类型、背景颜色、对称元素（基础） |

F6（CIF / PNG / CSV 导出）在 MVP 阶段暂未实现。

## 快速开始

```sh
yarn install
yarn dev          # 开发服务器
yarn build        # 类型检查 + 生产构建
yarn test:unit    # 单元测试
yarn lint         # 代码检查与格式化
```

## 空间群数据集

230 种空间群的数据由 `scripts/generate-spacegroups.py` 一次性生成，来源为标准数据库：

- **spglib**：对称操作（旋转矩阵 + 平移向量）、Hall / H-M 符号、点群。
- **pyxtal**：Wyckoff 位置（字母、多重度、位置对称性、代表坐标与全部等效坐标）。

生成脚本需要 Python 3.13（pyxtal 依赖），推荐用 `uv` 在隔离环境中运行：

```sh
uv run --python 3.13 --with pyxtal --with spglib scripts/generate-spacegroups.py
```

脚本会校验若干已知空间群（Pnma、Pm-3m、Fm-3m、P63/mmc、P-1）后输出：

```
src/data/spacegroups-index.json          # 编号 ↔ 符号 ↔ 晶系，随主包加载
src/data/spacegroups/<晶系>.json          # 按 7 大晶系拆分，动态 import 按需加载
```

## 部署

推送到 `main` 分支会触发 GitHub Actions（`.github/workflows/deploy.yml`）自动构建并发布到
GitHub Pages，自定义域名为 `crystal.jamaccao.cn`（域名已通过 `public/CNAME` 声明）。

首次部署前，请在仓库 `Settings → Pages` 中将 Source 设为 **GitHub Actions**，并配置好
`crystal.jamaccao.cn` 的 DNS 解析。

## 项目结构

```
src/
  components/     # SpaceGroupInput / InfoCard / CrystalViewer / DisplaySettings / AtomTable / StatusBar
  lib/            # lattice（坐标变换）、coords（坐标表达式）、symmetry（等效原子）、spacegroup（匹配/加载）
  stores/         # Pinia 全局状态
  types/          # TypeScript 数据模型
  data/           # 生成的空间群数据
scripts/          # 数据生成脚本
docs/             # 需求与规划文档
```

## 数据来源说明

空间群数据基于 International Tables for Crystallography Vol. A 的标准内容，经 spglib（BSD 许可）与 pyxtal（MIT 许可）导出后随项目分发。
