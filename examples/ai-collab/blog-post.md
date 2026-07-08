# 用 Git 五年后我才学会的 10 件事

写给所有还在用 git add . && git commit -m "update" 的人。

## 1. 提交前先看 diff

git diff 应该是肌肉记忆。每次 commit 前花 30 秒看自己改了什么，能避免 80% 的低级错误（不小心提交了 .env、临时调试代码、错误文件）。

## 2. 写有意义的 commit message

不要写"update"、"fix"、"改了点东西"。commit message 是给未来的你和同事看的，应该能独立读懂这次改动的目的。

推荐格式：

```
<类型>: <简短描述>

<详细说明>
```

类型用 feat / fix / docs / refactor / test 等。

## 3. 频繁提交

不要攒一周的工作量再 commit。频繁的小 commit 容易回滚、容易 code review、容易 bisect。理想粒度是 30 分钟到 2 小时的工作量。

## 4. 分支命名要规范

好分支名：feat-user-auth、fix-login-redirect、refactor-api-client。差分支名：test、new、my-branch。命名规范让团队协作效率提升 50%。

## 5. 永远不要 force push 到 main

这是规矩，不是建议。Force push 到 main 会覆盖团队成员的提交，导致数据丢失。Force push 只允许在个人 feature 分支上。

## 6. 用 .gitignore

每个项目第一个 commit 应该包含 .gitignore。常见的忽略：

- node_modules/
- .env（环境变量）
- __pycache__/
- *.log
- .DS_Store

## 7. 用 git stash 保存临时工作

改到一半需要切分支？git stash 帮你保存改动，切完回来 git stash pop。比手动复制粘贴安全 100 倍。

## 8. 学会 git rebase -i

交互式 rebase 可以合并 commit、改写 message、删除 commit、调整顺序。是清理 commit history 的利器。

## 9. 用 git bisect 找 bug

当 bug 不确定什么时候引入时，git bisect 二分查找非常高效。配合自动化测试，几分钟定位问题 commit。

## 10. 备份你的工作

Git 是分布式的，但 commit 前的工作没保存就是没保存。重要工作每天 push 到 remote，或用 stash 备份。

## 写在最后

Git 是工具，习惯才是核心。好的 Git 习惯需要刻意练习，初期会慢一点，长期回报巨大。