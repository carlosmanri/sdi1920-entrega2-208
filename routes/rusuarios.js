module.exports = function (app, swig, gestorBD) {

    /**
     * Muestra la vista de registro.
     * En el caso de que haya habido errores, se muestran y luego se borran de sesion
     * para que no se propaguen por el resto de vistas
     */
    app.get("/signin", function (req, res) {
        let respuesta = swig.renderFile('views/register.html', {
            mensaje: req.session.mensaje,
            tipoMensaje: req.session.tipoMensaje
        });
        req.session.mensaje = null;
        req.session.tipoMensaje = null;
        res.send(respuesta);
    });

    /**
     * Primero se comprueba que no hay campos vacios, despues que las contraseñas coincidadn.
     * Despues se comprueba en la base de datos si ya existe un usuario con ese email registrado
     * en el sistema.
     * Si se cumplen todas las condiciones se registra el usuario. Si no, se redirige al registro y se muestra el error
     * en pantalla
     */
    app.post('/signin', function (req, res) {

        req.session.tipoMensaje = "alert-danger";

        if (!req.body.email) {
            req.session.mensaje = "Error al registrar usuario: email vacio";
            res.redirect("/signin");
        } else if (!req.body.name) {
            req.session.mensaje = "Error al registrar usuario: nombre vacio";
            res.redirect("/signin");
        } else if (!req.body.surname) {
            req.session.mensaje = "Error al registrar usuario: apellidos vacios";
            res.redirect("/signin");
        } else if (!(String(req.body.password) === String(req.body.passwordConfirmation))) {
            req.session.mensaje = "Error al registrar usuario: las contraseñas no coinciden";
            res.redirect("/signin");
        } else {

            let criterio = {email: req.body.email};
            gestorBD.obtenerUsuarios(criterio, function (usuarios) {
                if (usuarios == null || usuarios.length === 0) {

                    let seguro = app.get("crypto").createHmac('sha256', app.get('clave'))
                        .update(req.body.password).digest('hex');
                    let usuario = {
                        email: req.body.email,
                        password: seguro,
                        name: req.body.name,
                        surname: req.body.surname,
                        friends:[]
                    };
                    gestorBD.insertarUsuario(usuario, function (id) {
                        if (id == null) {
                            app.get("logger").error("Error trying to register new user with email "+req.body.email);
                            req.session.mensaje = "Error al registrar usuario: Hay un problema con nuestros servidores :(";
                            req.session.tipoMensaje = "alert-danger";
                            res.redirect("/error");
                        } else {
                            app.get("logger").info("New user registered with email "+req.body.email);
                            req.session.mensaje = "Nuevo usuario registrado";
                            req.session.tipoMensaje = "alert-success";
                            res.redirect('/login');
                        }
                    });
                } else {
                    app.get("logger").warn("Trying to register new user with the existing email "+req.body.email);
                    req.session.mensaje = "Error al registrar usuario: No puede registrarse con ese email";
                    res.redirect("/signin");
                }
            });
        }
    });

    /**
     * Muestra la vista de login.
     * En el caso de que haya habido errores, se muestran y luego se borran de sesion
     * para que no se propaguen por el resto de vistas
     */
    app.get("/login", function (req, res) {
        let respuesta = swig.renderFile('views/login.html', {
            mensaje: req.session.mensaje,
            tipoMensaje: req.session.tipoMensaje
        });
        req.session.mensaje = null;
        req.session.tipoMensaje = null;
        res.send(respuesta);
    });

    /**
     * Inicar sesión
     *
     * Primero se comprueba que los valores sean válidos.
     * Despues se hace una consulta a la BD y se comprueba que existe
     * un usuario con esa contraseña(cifrada con sha256)
     *
     * Si existe se registra su email en la sesión actual y se redirige a home
     * En caso contrario se muestra la vista de login de nuevo con su error correspondiente
     */
    app.post("/login", function (req, res) {
        if (!req.body.email) {
            req.session.tipoMensaje = "alert-danger";
            req.session.mensaje = "Error al identificar usuario: email vacio";
            res.redirect("/login");
        } else if (!req.body.password) {
            req.session.tipoMensaje = "alert-danger";
            req.session.mensaje = "Error al identificar usuario: contraseña vacia";
            res.redirect("/login");
        } else {
            let seguro = app.get("crypto").createHmac('sha256', app.get('clave'))
                .update(req.body.password).digest('hex');
            let criterio = {
                email: req.body.email,
                password: seguro
            }
            gestorBD.obtenerUsuarios(criterio, function (usuarios) {
                if (usuarios == null || usuarios.length === 0) {
                    app.get("logger").warn("Bad login attempt with user "+req.body.email);
                    req.session.usuario = null;
                    req.session.mensaje = "Email o password incorrecto";
                    req.session.tipoMensaje = "alert-danger";
                    res.redirect("/login");
                } else {
                    app.get("logger").info("User "+ usuarios[0].email+" logged in");
                    req.session.usuario = usuarios[0].email;
                    req.session.favoritos = [];
                    res.redirect("/");
                }
            });
        }
    });

    /**
     * Se borra al usuario de la sesion actual.
     * Se muestra un alert al usuario para informarle de que su sesión se ha cerrado correctamente mientras se le redirige
     * al login
     */
    app.get('/logout', function (req, res) {
        app.get("logger").info("User "+req.session.usuario+" logged out");
        req.session.usuario = null;
        req.session.mensaje = "Usuario desconectado";
        req.session.tipoMensaje = "alert-success";
        res.redirect('/login');
   });


    /**
     * En el caso de que se haya producido una busqueda se procesa la query y se añade al criterio
     * Si se ha solicitado una pagina en concreto, se detecta que pagina es y se añade a la query, en caso contrario se
     * meuestra por defecto la pagina 1.
     * Se crea una consulta a la base de datos y se muestran en la vista usersList
     */
    app.get("/usuarios/", function(req,res){
        let criterio = {};
        if (req.query.busqueda != null && req.query.busqueda !== "") {
            criterio = {
                $or:[
                    {email: {$regex: ".*" + req.query.busqueda + ".*"}},
                    {name: {$regex: ".*" + req.query.busqueda + ".*"}},
                    {surname: {$regex: ".*" + req.query.busqueda + ".*"}}
                ]
            };
        }
        let pg = parseInt(req.query.pg); // Es String !!!
        if (req.query.pg == null) { // Puede no venir el param
            pg = 1;
        }
        gestorBD.obtenerUsuariosPg(criterio, pg, function (users, total) {
            if (users == null) {
                app.get("logger").error("Error al listar usuarios");
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
                gestorBD.obtenerUsuarios({email:req.session.usuario}, function(usuarios){
                    app.get("logger").info("User "+req.session.usuario+" listed page "+pg+ " of users");
                    let respuesta = swig.renderFile('views/usersList.html',
                        {
                            users: users,
                            paginas: paginas,
                            actual: pg,
                            mensaje: req.session.mensaje,
                            tipoMensaje: req.session.tipoMensaje,
                            sesion:req.session.usuario,
                            friends: usuarios[0].friends

                        });
                    req.session.mensaje = null;
                    req.session.tipoMensaje = null;
                    res.send(respuesta);
                });

            }
        });
    });


};