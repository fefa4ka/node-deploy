exports.tasks = {
    after: ['install_dependencies'],
    install_dependencies: {
        exec: ['sudo npm install -g gulp']
    }
}