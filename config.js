const fs = require('fs')

if (fs.existsSync('./privateconfig.json')) {
    const privateconfig = require('./privateconfig.json');
    module.exports = {
        clientId: "294470823627063296",
        token: privateconfig.token,
        DBHOST: privateconfig.DBHOST,
        DBPASS: privateconfig.DBPASS
    };
}
else{
    module.exports = {
        clientId: "534686392589221898",
        token: process.env.TOKEN,
        DBHOST: process.env.DBHOST,
        DBPASS: process.env.DBPASS
    };
}




