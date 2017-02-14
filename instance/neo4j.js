exports.tasks = {
    before: ['add_sources'],
    after: ['configure'],
    add_sources: {
        exec: [
            'sudo echo "Add neo4j repository key"',
            'wget -O - https://debian.neo4j.org/neotechnology.gpg.key | sudo apt-key add -',
            'echo "deb https://debian.neo4j.org/repo stable/" | sudo tee /etc/apt/sources.list.d/neo4j.list',
            'sudo apt-get install -y -qq apt-transport-https'
        ]
    },
    configure: {
        exec: [
            'sudo neo4j start',
            // TODO: Настройка конфига, доступ с публичного IP, настройка файрвола.
            server => { return `http -a neo4j:neo4j POST http://localhost:7474/user/neo4j/password password=${server.pass}` }
        ]
    }
}