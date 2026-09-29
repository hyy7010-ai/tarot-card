#!/bin/bash
# 部署到 Vercel（https://realheart.vercel.app）。用法：./scripts/deploy.sh
#
# ⚠️ 为什么要把构建产物拷到仓库外面再传：
#    CLI 会把本地 git 的提交作者（jzey805）附在部署上，而 Vercel 项目属于 hohoyo234，
#    免费版团队不认非成员的提交作者，部署会停在 BLOCKED 永远不上线 —— 看起来像「传不完」。
#    在 git 仓库外面部署就不带提交信息。只传构建产物，源码和 .env 都不离开这台电脑。
set -e
cd "$(dirname "$0")/.."
vercel build --prod
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/.vercel"
cp .vercel/project.json "$TMP/.vercel/"
cp -R .vercel/output "$TMP/.vercel/output"
cd "$TMP" && vercel deploy --prebuilt --prod --yes
