const WebSocket = require("ws");
const WebSocketPort = Number(process.env.WSPORT || 3001);

const wss = new WebSocket.Server({
    port: WebSocketPort
});

module.exports = function (client) {
    wss.on("connection", function connection(socket, request) {
        //Player Joining
        socket.on("message", function incoming(msg) {
            msgobj = JSON.parse(msg);
            if (msgobj.action === "ping") {
                //ignore
            } //for testing T001
            //console.log('received: %s', message); // Debugging
            // incomming Action
            switch (msgobj.action) {
                case "ping":
                    socket.send(
                        JSON.stringify({
                            action: "ping"
                        })
                    );
                    break;
                case "join":
                    let p1 = region.join();
                    socket.send(
                        JSON.stringify({
                            action: "join",
                            player: p1,
                        })
                    );
                    break;
                case "moveSync":
                    let p2 = msgobj.player;
                    region.moveSync(p2);
                    break;
                case "fire":
                    //TODO cannon ball
                    break;
                default:
                    socket.send(
                        JSON.stringify({
                            action: "error",
                            code: "ER101",
                            comment: "requested action not found"
                        })
                    );
                    break;
            }
        });
    });

}