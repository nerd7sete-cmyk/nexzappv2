# NEX-ZAPP PRO — Deploy VPS

Domínio configurado para produção:

- Landing / Login Cliente: `https://nexzapp.com.br`
- Admin: `https://nexzapp.com.br/admin`
- Revendedor: `https://nexzapp.com.br/revenda`

## Substituir sistema antigo sem perder dados

Na VPS, antes de trocar:

```bash
cd /var/www/nex-zapp
cp -r data data-backup-$(date +%F-%H%M)
```

Depois envie esta nova pasta/ZIP para a VPS e substitua os arquivos do sistema, mas preserve a pasta `data/` antiga se quiser manter clientes, pedidos, PIX, planos e revendedores.

## Instalação do zero

```bash
sudo apt update
sudo apt install -y nodejs npm nginx certbot python3-certbot-nginx unzip
sudo npm install -g pm2

sudo mkdir -p /var/www/nex-zapp
sudo chown -R $USER:$USER /var/www/nex-zapp
```

Envie o ZIP para `/var/www/nex-zapp`, extraia e rode:

```bash
cd /var/www/nex-zapp
npm install
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## Nginx

Copie o arquivo:

```bash
sudo cp nginx-nexzapp.conf /etc/nginx/sites-available/nexzapp
sudo ln -sf /etc/nginx/sites-available/nexzapp /etc/nginx/sites-enabled/nexzapp
sudo nginx -t
sudo systemctl reload nginx
```

## SSL grátis

Aponte o DNS do domínio para o IP da VPS antes.

```bash
sudo certbot --nginx -d nexzapp.com.br -d www.nexzapp.com.br
```

## Atualizar versão mantendo dados

```bash
cd /var/www/nex-zapp
pm2 stop nex-zapp
cp -r data /tmp/nex-zapp-data-backup
```

Substitua os arquivos pela nova versão, depois:

```bash
cp -r /tmp/nex-zapp-data-backup ./data
npm install
pm2 restart nex-zapp
```

## Observação importante

Se os pedidos, clientes ou revendedores antigos sumirem, é porque a pasta `data/` antiga foi sobrescrita. Restaure o backup:

```bash
rm -rf data
cp -r data-backup-YYYY-MM-DD-HHMM data
pm2 restart nex-zapp
```
