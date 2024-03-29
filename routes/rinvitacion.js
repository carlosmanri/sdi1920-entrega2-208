module.exports = function (app, swig, gestorBD) {

    /**
     * Se comprueba que el id enviado como parametro es de un usuario existente, no es el de la persona que manda
     * la invitacion.
     * Tambien se comprueba que no existe ninguna peticion a esa misma persona para evitar duplicados.
     * Si es correcto se guarda en la base de datos, si no se redirige a la vista de usuarios y se muestra el error
     *
     */
    app.get('/invitacion/enviar/:to_id', function (req, res) {

        let criterio = {"_id": gestorBD.mongo.ObjectID(req.params.to_id)};

        gestorBD.obtenerUsuarios(criterio, function (usuarios) {
            if (usuarios[0] === null) {
                app.get("logger").warn(req.session.usuario+" tried to send a invitation to a non existing user");
                req.session.mensaje = "Error: el usuario no existe";
                req.session.tipoMensaje = "alert-danger";
                res.redirect("/usuarios");
            } else {
                if (usuarios[0].email === req.session.usuario) {
                    app.get("logger").warn(req.session.usuario+" tried to send a invitation to himself");
                    req.session.mensaje = "Error: no puedes enviarte una petición a ti mismo";
                    req.session.tipoMensaje = "alert-danger";
                    res.redirect("/usuarios");
                    return;
                }
                let criterio = {
                    $and: [
                        {from: {$eq: req.session.usuario}},
                        {to: {$eq: usuarios[0].email}}
                    ]
                };
                gestorBD.obtenerInvitaciones(criterio, function (invitaciones) {
                    if (invitaciones[0] == null) {
                        let invitacion = {
                            from: req.session.usuario,
                            to: usuarios[0].email,
                            dateTime: Date.now()
                        }
                        gestorBD.insertarInvitacion(invitacion, function (id) {
                            if (id == null) {
                                app.get("logger").error("Error while storing a invitation in the database");
                                req.session.mensaje = "Error al añadir invitacion: Hay un problema con nuestros servidores :(";
                                req.session.tipoMensaje = "alert-danger";
                                res.redirect("/usuarios");
                            } else {
                                app.get("logger").info(req.session.usuario+" send a invitation to "+usuarios[0].email);
                                req.session.mensaje = "Invitacion enviada";
                                req.session.tipoMensaje = "alert-success";
                                res.redirect('/usuarios');
                            }
                        });
                    } else {
                        app.get("logger").warn(req.session.usuario+" tried to send a repeated invitation");
                        req.session.mensaje = "Error: ya hay una petición pendiente";
                        req.session.tipoMensaje = "alert-danger";
                        res.redirect("/usuarios");
                    }
                });
            }
        });
    });

    /**
     * Se crea una peticion a la base de datos (se incluye el numero de paginacion en caso de que se haya solicitado)
     * Despues se crea otra peticion para completar la informacion de las invitaciones(nombre, apellidos) ya que solo almacenan
     * el id de la otra persona.
     * Por ultimo se muestran en la vista invitaciones
     */
    app.get('/invitaciones', function (req, res) {
        let criterio = {
            to: req.session.usuario
        };

        let pg = parseInt(req.query.pg); // Es String !!!
        if (req.query.pg == null) { // Puede no venir el param
            pg = 1;
        }
        gestorBD.obtenerInvitacionesPg(criterio, pg, function (invitaciones, total) {
            if (invitaciones == null) {
                app.get("logger").error("Error at listing invitations");
                res.send("Error al listar ");
            } else {
                let ultimaPg = total / 4;
                if (total % 4 > 0) { // Sobran decimales
                    ultimaPg = ultimaPg + 1;
                }
                let paginas = []; // paginas mostrar
                for (let i = pg - 2; i <= pg + 2; i++) {
                    if (i > 0 && i <= ultimaPg) {
                        paginas.push(i);
                    }
                }
                let criterio = {};
                gestorBD.obtenerUsuarios(criterio, function (users) {
                    if (users == null) {
                        app.get("logger").error("Error at listing invitations");
                        res.send("Error al listar ");
                    } else {
                        let invitacionesCompletas = invitaciones.map(invi => {
                            invi.from = users.find(user => user.email === invi.from);
                            invi.dateTime = new Date(invi.dateTime).toLocaleDateString("es-ES") + " " +  new Date(invi.dateTime).toLocaleTimeString("es-ES");
                            return invi;
                        });

                        let respuesta = swig.renderFile('views/invitaciones.html',
                            {
                                invitaciones: invitacionesCompletas,
                                paginas: paginas,
                                actual: pg,
                                mensaje: req.session.mensaje,
                                tipoMensaje: req.session.tipoMensaje,
                                sesion: req.session.usuario
                            });
                        req.session.mensaje = null;
                        req.session.tipoMensaje = null;
                        app.get("logger").info("User "+req.session.usuario+" listed page "+pg+ " of invitations");
                        res.send(respuesta);
                    }
                });


            }
        });
    });

    /**
     * Primero se comprueba que la invitacion existe
     * Despues se comprueba que el usario que mandó la invitacion sigue existiendo en el sistema.
     * Se añade a cada usuario en la lista de amigos del otro usuario  y posteriormente se borra la invitacion
     *
     */
    app.get('/invitacion/aceptar/:invitacion_id', function (req, res) {

        let criterio = {"_id": gestorBD.mongo.ObjectID(req.params.invitacion_id)};

        gestorBD.obtenerInvitaciones(criterio, function (invitaciones) {
            if (invitaciones[0] === null) {
                req.session.mensaje = "Error: la invitación no existe";
                req.session.tipoMensaje = "alert-danger";
                res.redirect("/invitaciones");
            } else {
                let invitacion = invitaciones[0];
                let criterio = {
                    $or: [
                        {email: {$eq: invitacion.from}},
                        {email: {$eq: invitacion.to}}
                    ]
                };
                gestorBD.obtenerUsuarios(criterio, function (usuarios) {
                    if (usuarios[0] === null) {
                        req.session.mensaje = "Error: el usuario de la invitacion ya no existe";
                        req.session.tipoMensaje = "alert-danger";
                        res.redirect("/invitaciones");
                    } else {
                        if (!usuarios[0].friends) {
                            usuarios[0].friends = []
                        }
                        usuarios[0].friends.push(usuarios[1].email);
                        gestorBD.modificarUsuario({email: usuarios[0].email}, usuarios[0], function (result) {
                            if (result == null) {
                                req.session.mensaje = "Error: no se pudo añadir el amigo";
                                req.session.tipoMensaje = "alert-danger";
                                res.redirect("/invitaciones");
                            } else {
                                if (!usuarios[1].friends) {
                                    usuarios[1].friends = []
                                }
                                usuarios[1].friends.push(usuarios[0].email);
                                gestorBD.modificarUsuario({email: usuarios[1].email}, usuarios[1], function (result) {
                                    if (result == null) {
                                        req.session.mensaje = "Error: no se pudo añadir el amigo";
                                        req.session.tipoMensaje = "alert-danger";
                                        res.redirect("/invitaciones");
                                    } else {
                                        let criterio = {
                                            $or:[
                                                {$and:[
                                                        {to:{ $eq: usuarios[0].email}},
                                                        {from:{ $eq: usuarios[1].email}}
                                                    ]},
                                                {$and:[
                                                        {to:{ $eq: usuarios[1].email}},
                                                        {from:{ $eq: usuarios[0].email}}
                                                    ]}
                                            ]
                                        };
                                        gestorBD.borrarInvitacion(criterio, function (isDeleted) {
                                            if (isDeleted === false) {
                                                req.session.mensaje = "Error: no se pudo borrar la invitacion";
                                                req.session.tipoMensaje = "alert-danger";
                                                res.redirect("/invitaciones");
                                            } else {
                                                req.session.mensaje = "Invitación aceptada";
                                                req.session.tipoMensaje = "alert-success";
                                                res.redirect("/invitaciones");
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
        });
    });

}