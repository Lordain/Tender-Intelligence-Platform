# 自建服务器部署（香港）

2026-11-19 Vercel 免费版因 CPU 用超暂停了账号，网站改为部署在自己的服务器上：
阿里云国际版香港轻量应用服务器，Ubuntu 24.04。数据库仍是 Supabase（us-east-2），不动。

结构：

- **Caddy**：对外的 80/443，自动申请和续期 HTTPS 证书，转发给本机 3000 端口
- **systemd 服务 `latintender`**：用 `next start` 运行网站，开机自启、崩溃自动重启
- **/etc/cron.d/latintender**：代替原来 vercel.json 里的 12 个定时任务，时间相同（UTC）
- **GitHub Actions `Deploy to server`**：main 每次合并后自动登录服务器部署

目录：

```
/srv/latintender/repo        代码（只读 deploy key 拉取）
/srv/latintender/releases/   每次部署一个目录，保留最近 3 个
/srv/latintender/current     指向正在运行的那个版本
/srv/latintender/shared/.env 环境变量（密钥），只有 latintender 用户能读
/srv/latintender/logs/       deploy.log、cron.log
```

下面的命令在 **PowerShell 里 ssh 登录服务器后** 运行。`<IP>` 换成服务器公网 IP。
**所有密钥、密码都只填在服务器上，不要发到聊天里。**

## 1. 登录服务器

```powershell
ssh root@<IP>
```

## 2. 建用户、生成给 GitHub 用的只读密钥

```bash
useradd --create-home --shell /bin/bash latintender
mkdir -p /srv/latintender && chown latintender:latintender /srv/latintender
sudo -u latintender ssh-keygen -t ed25519 -N "" -f /home/latintender/.ssh/id_ed25519
sudo -u latintender bash -c 'ssh-keyscan github.com >> ~/.ssh/known_hosts'
cat /home/latintender/.ssh/id_ed25519.pub
```

把最后一行输出（`ssh-ed25519 ...` 开头）复制下来，打开 GitHub 仓库
**Settings → Deploy keys → Add deploy key**，Title 填 `hk-server`，粘贴进去，
**不要勾选 Allow write access**，保存。

## 3. 拉代码、一键安装

```bash
sudo -u latintender git clone git@github.com:Lordain/Tender-Intelligence-Platform.git /srv/latintender/repo
sudo bash /srv/latintender/repo/deploy/setup-server.sh
```

## 4. 填环境变量

在 Vercel 后台 **Project → Settings → Environment Variables**（Production）里，
把所有变量的值抄到服务器上：

```bash
sudo -u latintender nano /srv/latintender/shared/.env
```

一行一个，格式 `名字=值`。除了 Vercel 上已有的，再加两行：

```
DEPLOYMENT_ENV=production
APP_URL=https://latintender.com
```

需要的变量（Vercel 上有哪个就抄哪个）：
`NEXT_PUBLIC_SUPABASE_URL` `NEXT_PUBLIC_SUPABASE_ANON_KEY` `SUPABASE_SERVICE_ROLE_KEY`
`CRON_SECRET` `GITHUB_DISPATCH_TOKEN` `ADMIN_EMAILS`
`RESEND_API_KEY` `RESEND_FROM_EMAIL` `EMAIL_NOTIFICATIONS_ENABLED` `WEBHOOK_ALERT_EMAILS`
`STRIPE_SECRET_KEY` `STRIPE_WEBHOOK_SECRET` `STRIPE_PRICE_*`（6 个）
`DASHSCOPE_API_KEY` `ANTHROPIC_API_KEY` `COMPRAS_MX_OCDS_API_URL`
`NEXT_PUBLIC_SUPPORT_EMAIL` `NEXT_PUBLIC_BILLING_EMAIL` `NEXT_PUBLIC_SUPPORT_WHATSAPP` `NEXT_PUBLIC_SUPPORT_WECHAT`
`LEGAL_OPERATOR_NAME` `LEGAL_OPERATOR_ADDRESS` `INVOICE_SELLER_*`
`USD_MXN_BANK_TRANSFER_RATE` `BANK_TRANSFER_DAYS_UNTIL_DUE` `INTERNATIONAL_WIRE_ENABLED`
`GOOGLE_SITE_VERIFICATION` `BING_SITE_VERIFICATION` `BAIDU_SITE_VERIFICATION` `SOGOU_SITE_VERIFICATION` `TOUTIAO_SITE_VERIFICATION` `BAIDU_PUSH_TOKEN`

保存：`Ctrl+O` 回车，退出：`Ctrl+X`。

## 5. 第一次部署

```bash
sudo -u latintender bash /srv/latintender/repo/deploy/deploy.sh
```

大约 5–10 分钟，最后一行是 `已上线 <版本号>` 就成功了。在服务器上自测：

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: latintender.com" http://127.0.0.1:3000/
```

输出 `200` 即正常。

## 6. 切换域名（GoDaddy）

GoDaddy → 我的产品 → latintender.com → **DNS**，找到类型为 **A**、名称为 **@** 的那一条，
把值 `216.198.79.1` 改成 `<IP>`，TTL 选 600 秒，保存。**其他记录（Zoho 邮箱的 MX、TXT）都不要动。**

几分钟到半小时后 https://latintender.com 就会打开新服务器，证书由 Caddy 自动申请。
要退回 Vercel，把 A 记录改回 `216.198.79.1` 即可。

## 7. 合并后自动部署

在自己电脑的 PowerShell 里生成一把给 GitHub Actions 用的密钥：

```powershell
ssh-keygen -t ed25519 -N '""' -f $HOME\.ssh\latintender_deploy
Get-Content $HOME\.ssh\latintender_deploy.pub
```

把输出的公钥追加到服务器上：

```bash
sudo -u latintender bash -c 'cat >> ~/.ssh/authorized_keys'   # 粘贴公钥，回车，Ctrl+D
sudo -u latintender chmod 600 /home/latintender/.ssh/authorized_keys
```

然后在 GitHub 仓库 **Settings → Secrets and variables → Actions → New repository secret** 加三个：

| 名字 | 值 |
|---|---|
| `DEPLOY_HOST` | 服务器 IP |
| `DEPLOY_SSH_KEY` | `Get-Content $HOME\.ssh\latintender_deploy` 的全部内容（私钥） |
| `DEPLOY_KNOWN_HOSTS` | PowerShell 里 `ssh-keyscan <IP>` 的输出 |

之后每次合并到 main，Actions 里的 **Deploy to server** 会自动部署。

## 切换后要做的事

- **Stripe**：网站停的这几天，Stripe 发来的付款通知（webhook）可能失败了。到 Stripe 后台
  **Developers → Webhooks** 看有没有失败的事件，有的话点 Resend 重发。
- **Vercel**：vercel.json 里的定时任务已经删掉，避免 12/19 恢复后和服务器各跑一遍。
  稳定后建议在 Vercel 项目 **Settings → Git** 里 Disconnect，不再往 Vercel 部署。

## 日常排查

```bash
sudo systemctl status latintender          # 网站进程状态
sudo journalctl -u latintender -n 100      # 网站最近的日志
tail -n 50 /srv/latintender/logs/cron.log  # 定时任务结果（应该都是 HTTP 200）
tail -n 50 /srv/latintender/logs/deploy.log
```

回滚到上一个版本：

```bash
ls -1dt /srv/latintender/releases/*/       # 第二行就是上一个版本
sudo -u latintender ln -sfn <那个目录> /srv/latintender/current
sudo systemctl restart latintender
```

`/etc/cron.d/latintender` 只在运行 `setup-server.sh` 时更新；改了 `deploy/crontab` 以后，
在服务器上再运行一次 `sudo bash /srv/latintender/repo/deploy/setup-server.sh`。
