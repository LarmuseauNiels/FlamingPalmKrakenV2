
const express = require('express');
var cors = require('cors');
const app = express();
const mysql = require('mysql');
const { DBHOST,DBPASS } = require('../config.js');


module.exports = function (client) {
    app.use(cors());

    DBconnection = mysql.createPool({
        connectionLimit : 10,
        host            : DBHOST,
        user            : 'root',
        password        : DBPASS,
        database        : 'discordstats'
      });

    //client.log("Loading WebApi Module")
    app.get('/', function (req, res) {
        res.send('API test page.')
    })
    
    app.get('/activity', function (req, res) {
        DBconnection.query(
            'select timestamp,count(*) as online from VoiceConnected '+
            ' WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY '+
            ' group by timestamp',
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/activityFromDate/:date', function (req, res) {
        var date = req.params["date"];
        DBconnection.query(
            'select timestamp,count(*) as online from VoiceConnected '+
            ' WHERE date(TimeStamp) = ? '+
            ' group by timestamp ',[date],
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/userActivityDate/:date', function (req, res) {
        var date = req.params["date"];
        DBconnection.query(
           "SELECT Members.DisplayName as name, count(*) as y FROM VoiceConnected LEFT JOIN Members ON VoiceConnected.ID = Members.ID "+
           " WHERE date(TimeStamp) = ? GROUP BY VoiceConnected.ID order by y desc" , [date],
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/channelActivity', function (req, res) {
        DBconnection.query(
           "select Channel.ChannelName as name, count(*) as y from VoiceConnected left join Channel on VoiceConnected.ChannelID = Channel.ID "+
           " WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY group by Channel.ChannelName",
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })
    app.get('/userActivity', function (req, res) {
        DBconnection.query(
           "SELECT Members.DisplayName as name, count(*) as y FROM VoiceConnected LEFT JOIN Members ON VoiceConnected.ID = Members.ID "+
           " WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY GROUP BY VoiceConnected.ID order by y desc" ,
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

   

    app.get('/userActivityAll', function (req, res) {
        DBconnection.query(
           "SELECT Members.DisplayName as name, count(*) as y FROM VoiceConnected LEFT JOIN Members ON VoiceConnected.ID = Members.ID "+
           " GROUP BY VoiceConnected.ID order by y desc" ,
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/userOnlineTimes/:userId', function (req, res) {
        var userId = req.params["userId"];
        DBconnection.query(
           "SELECT timestamp, 1 as online FROM `VoiceConnected` " +
           "JOIN Channel on Channel.ID = VoiceConnected.ChannelID " +
           "WHERE VoiceConnected.TimeStamp >= curdate() - INTERVAL DAYOFWEEK(curdate())+6 DAY AND VoiceConnected.ID = ?" , [userId],
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/userInfo/:userId', function (req, res) {
        var userId = req.params["userId"];
        DBconnection.query(
           "SELECT * FROM `Members` where ID =  ?" , [userId],
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/PossibleYears', function (req, res) {
        var year = req.params["year"];
        DBconnection.query(
            "select DISTINCT YEAR(timestamp) from VoiceConnected",
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/YearActivity/:year', function (req, res) {
        var year = req.params["year"];
        DBconnection.query(
            "select  MONTH(timestamp) as month, DAY(timestamp) as day ,YEAR(timestamp) as year, count(*) as online from VoiceConnected  "+
            "Where YEAR(timestamp) = ? "+
            "group by year,month, day",[year],
            function (error, results, fields) {
                if(error != null){ 
                    client.log(error)
                    res.send(JSON.stringify("Failure"))
                }
                else{
                    res.send(JSON.stringify(results))
            }
        });
    })

    app.get('/events', function (req, res) {
        console.log(client.guilds)
         client.guilds.fetch("530537522355240961").then(guild => {
             console.log("guild= "+ guild)
            guild.scheduledEvents.fetch().then(events => {
                console.log("guild= "+ events)
                res.send(JSON.stringify(events))
            });
        });
    })

    
    app.listen(3000)
}
