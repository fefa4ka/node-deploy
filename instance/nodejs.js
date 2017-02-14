exports.tasks = {
    after: ['link_to_bin'],
    link_to_bin: {
        exec: ['sudo ln -sf /usr/bin/nodejs /usr/bin/node']
    }
}