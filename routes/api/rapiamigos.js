module.exports = function (app, gestorBD) {


    app.get("/api/amigos", function (req, res) {

        gestorBD.obtenerUsuarios({email: res.usuario}, function (usuario) {
            gestorBD.obtenerUsuarios({email: {$in: usuario[0].friends}}, function (friends) {
                friends = friends.map(friend => {
                    delete friend["password"];
                    return friend
                });
                let friendsIDs = friends.map(friend => friend._id);
                app.get("logger").info("API: User "+res.usuario+" listed friends" );
                res.status(200);
                res.json(friends);
            });
        });
    });


};