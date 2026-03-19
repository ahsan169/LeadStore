# One-time: add deploy key to your droplet

Run this **once** in your **DigitalOcean droplet console** (root):

```bash
mkdir -p ~/.ssh && echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAILr0n7GKhLvC991XWreLxQipOSUaCKJ7XbFz5b6Xlbuv cursor-deploy-leadstorefront' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

Then from your **Mac** you can deploy (no password) with:

```bash
cd /Users/user/Downloads/LeadStorefrontAI
SSH_KEY="$(pwd)/.deploy-key" ./update-deploy-one-ssh.sh
```

After the key is added, I can run that for you from here and the update will go through automatically.
