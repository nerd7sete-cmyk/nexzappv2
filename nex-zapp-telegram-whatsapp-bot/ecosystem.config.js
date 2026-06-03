module.exports = {
  apps: [{
    name: 'nexzapp-telegram',
    script: 'bot.js',
    watch: false,
    autorestart: true,
    max_memory_restart: '900M'
  }]
}
