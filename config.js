const fs = require("fs");

if (false) {
  /*
    this.privateconfig = require("./privateconfig.json");
    module.exports = {
      clientId: "534686392589221898", //"294470823627063296",
      token: this.privateconfig.token,
      DBHOST: this.privateconfig.DBHOST,
      DBPASS: this.privateconfig.DBPASS,
    };
    */
} else {
  module.exports = {
    clientId: "534686392589221898",
    token: process.env.TOKEN,
    DBHOST: process.env.DBHOST,
    DBPASS: process.env.DBPASS,
  };
}
