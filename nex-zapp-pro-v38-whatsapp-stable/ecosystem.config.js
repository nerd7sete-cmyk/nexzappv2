module.exports = {
  apps: [
    {
      name: "nex-zapp",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 4000,
        DOMAIN: "nexzapp.com.br"
      }
    }
  ]
}
