'use strict'
let pjson = require('../package.json')
let fs = require('fs')

// Сервера, с которым имеем дело
// Список серверов — это папки в projects
// Настройки по умолчанию берём из package.json - deploy.servers.default
// Настройки сервера и аутентификации берём из projects/{server-name}/settings.json
let servers = new (function () {
    let list = []
    // Настройки по умолчанию
    let default_config = pjson.deploy.servers.default

    function getServers () {
        return fs.readdirSync('projects/')
            .filter(file => fs.statSync('projects/' + file).isDirectory())
    }

    getServers().forEach(serverName => {
        // Составляем список из серверов, для которых есть настройки
        try {
            let server = require(`../projects/${serverName}/settings.json`)
            server.name = serverName
            server.default = default_config

            list.push(server)
        } catch (e) {
            console.log(`Server does't have configuration ./projects/${serverName}/settings.json`)
        }
    })

    return list
})

exports.servers = servers
