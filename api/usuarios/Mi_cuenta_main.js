const router = require("express").Router();
const db = require("../../config/db");
const { hashPass, verificarPass } = require("../auth/funciones");

router.get("/mi-cuenta", (req, res) => {
    const idUsuario = req.user.Id_usuario;

    const consultaUsuario = `
        SELECT
            u.Id_usuario,
            u.nombre,
            u.correo,
            u.foto_perfil,
            u.\`teléfono\` AS telefono,
            u.\`descripción\` AS descripcion,

            (
                SELECT COUNT(*)
                FROM publicaciones_compra pc
                INNER JOIN prendas p ON pc.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) +
            (
                SELECT COUNT(*)
                FROM publicaciones_intercambio pi
                INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) AS publicaciones,

            (
                SELECT COUNT(*)
                FROM publicaciones_compra pc
                INNER JOIN prendas p ON pc.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) AS ventas,

            (
                SELECT COUNT(*)
                FROM publicaciones_intercambio pi
                INNER JOIN prendas p ON pi.id_prenda = p.id_prenda
                WHERE p.Id_usuario = u.Id_usuario
            ) AS intercambios

        FROM usuarios u
        WHERE u.Id_usuario = ?
    `;

    db.query(consultaUsuario, [idUsuario])
        .then(([resultados]) => {
            if (resultados.length === 0) {
                return res.status(404).json({
                    mensaje: "No se encontró el usuario"
                });
            }

            const usuario = resultados[0];

            return Promise.all([

                db.query(
                    `
                        SELECT
                            p.Id_pregunta,
                            o.id_opcion,
                            o.opcion,
                            c.codigo AS codigo_color
                        FROM opciones_usuarios ou
                        INNER JOIN opciones o
                            ON ou.id_opcion = o.id_opcion
                        INNER JOIN preguntas p
                            ON o.id_pregunta = p.Id_pregunta
                        LEFT JOIN colores c
                            ON c.color = o.opcion
                        WHERE ou.Id_usuario = ?
                        ORDER BY p.Id_pregunta, o.id_opcion
                    `,
                    [idUsuario]
                ),

                db.query(
                    `
                        SELECT
                            e.id_estilo,
                            e.estilo,
                            re.porcentaje
                        FROM resultados r
                        INNER JOIN resultado_estilo re
                            ON r.id_resultado = re.id_resultado
                        INNER JOIN estilos e
                            ON re.id_estilo = e.id_estilo
                        WHERE r.Id_usuario = ?
                        ORDER BY re.porcentaje DESC
                    `,
                    [idUsuario]
                ),

                db.query(
                    `
                        SELECT
                            o.id_opcion,
                            o.id_pregunta,
                            o.opcion
                        FROM opciones o
                        WHERE o.id_pregunta IN (1, 3, 5)
                        ORDER BY o.id_pregunta, o.id_opcion
                    `
                ),

                db.query(
                    `
                        SELECT
                            id_color,
                            color,
                            codigo
                        FROM colores
                        ORDER BY id_color
                    `
                ),

                db.query(
                    `
                        SELECT
                            id_estilo,
                            estilo
                        FROM estilos
                        ORDER BY estilo
                    `
                )

            ]).then(([
                preferencias,
                resultadosEstilos,
                opcionesDisponibles,
                coloresDisponibles,
                estilosDisponibles
            ]) => {

                const preferenciasUsuario = {
                    prendas: [],
                    colores: [],
                    temporadas: [],
                    transmitir: [],
                    calce: [],
                    estilos: []
                };

                const categoriasPorPregunta = {
                    1: "prendas",
                    2: "colores",
                    3: "temporadas",
                    4: "transmitir",
                    5: "calce",
                    6: "estilos"
                };

                preferencias[0].forEach(opcion => {
                    const idPregunta = Number(opcion.Id_pregunta);
                    const categoria = categoriasPorPregunta[idPregunta];

                    if (!categoria) return;

                    if (idPregunta === 2) {
                        preferenciasUsuario.colores.push({
                            color: opcion.opcion,
                            codigo: opcion.codigo_color
                        });
                    } else {
                        preferenciasUsuario[categoria].push(opcion.opcion);
                    }
                });

                const catalogos = {
                    prendas: [],
                    colores: [],
                    temporadas: [],
                    calce: [],
                    estilos: []
                };

                opcionesDisponibles[0].forEach(opcion => {
                    const idPregunta = Number(opcion.id_pregunta);

                    if (idPregunta === 1) {
                        catalogos.prendas.push(opcion.opcion);
                    } else if (idPregunta === 3) {
                        catalogos.temporadas.push(opcion.opcion);
                    } else if (idPregunta === 5) {
                        catalogos.calce.push(opcion.opcion);
                    }
                });

                coloresDisponibles[0].forEach(color => {
                    catalogos.colores.push({
                        id_color: color.id_color,
                        color: color.color,
                        codigo: color.codigo
                    });
                });

                const estilosResultado = resultadosEstilos[0].map(estilo => ({
                    id_estilo: estilo.id_estilo,
                    estilo: estilo.estilo,
                    porcentaje: Number(estilo.porcentaje)
                }));

                estilosDisponibles[0].forEach(estilo => {
                    catalogos.estilos.push({
                        id_estilo: estilo.id_estilo,
                        estilo: estilo.estilo
                    });
                });

                res.status(200).json({
                    usuario: {
                        id: usuario.Id_usuario,
                        nombre: usuario.nombre,
                        correo: usuario.correo,
                        foto_perfil: usuario.foto_perfil,
                        telefono: usuario.telefono,
                        descripcion: usuario.descripcion
                    },

                    estadisticas: {
                        publicaciones: usuario.publicaciones,
                        ventas: usuario.ventas,
                        intercambios: usuario.intercambios
                    },

                    preferencias: preferenciasUsuario,

                    catalogos,

                    resultados: estilosResultado
                });
            });
        })
        .catch(error => {
            console.error("Error al obtener mi cuenta:", error);

            res.status(500).json({
                mensaje: "Error al obtener los datos de la cuenta"
            });
        });
});

router.put("/mi-cuenta", (req, res) => {
    const idUsuario = req.user.Id_usuario;

    const { nombre, telefono, descripcion } = req.body;

    let rutaFoto = null;
    const archivo = req.files?.fotoPerfil;

    const guardarFoto = archivo
        ? (() => {
            const nombreArchivo = `${Date.now()}-${archivo.name}`;
            const carpeta = "uploads/perfiles/";

            return archivo.mv(carpeta + nombreArchivo)
                .then(() => {
                    rutaFoto = `/uploads/perfiles/${nombreArchivo}`;
                });
        })()
        : Promise.resolve();

    guardarFoto
        .then(() => {
            const consulta = `
                UPDATE usuarios
                SET
                    nombre = ?,
                    \`teléfono\` = ?,
                    \`descripción\` = ?,
                    foto_perfil = COALESCE(?, foto_perfil)
                WHERE Id_usuario = ?
            `;

            return db.query(consulta, [
                nombre,
                telefono,
                descripcion,
                rutaFoto,
                idUsuario
            ]);
        })
        .then(() => {
            res.status(200).json({
                mensaje: "Perfil actualizado correctamente",
                foto_perfil: rutaFoto
            });
        })
        .catch(error => {
            console.error("Error al actualizar el perfil:", error);

            res.status(500).json({
                mensaje: "Error al actualizar el perfil"
            });
        });
});

router.put("/cambiar-contrasena", (req, res) => {
    const idUsuario = req.user.Id_usuario;

    const {
        contrasenaActual,
        nuevaContrasena,
        confirmarContrasena
    } = req.body;

    if (!contrasenaActual || !nuevaContrasena || !confirmarContrasena) {
        return res.status(400).json({
            mensaje: "Todos los campos son obligatorios"
        });
    }

    if (nuevaContrasena !== confirmarContrasena) {
        return res.status(400).json({
            mensaje: "Las contraseñas nuevas no coinciden"
        });
    }

    if (nuevaContrasena === contrasenaActual) {
        return res.status(400).json({
            mensaje: "La nueva contraseña debe ser diferente a la actual"
        });
    }

    const consulta = `
        SELECT \`contraseña\`
        FROM usuarios
        WHERE Id_usuario = ?
    `;

    db.query(consulta, [idUsuario])
        .then(([resultados]) => {
            if (resultados.length === 0) {
                res.status(404).json({
                    mensaje: "No se encontró el usuario"
                });
                return null;
            }

            return verificarPass(
                contrasenaActual,
                resultados[0].contraseña
            );
        })
        .then(coincide => {
            if (coincide === null) return;

            if (!coincide) {
                res.status(400).json({
                    mensaje: "La contraseña actual es incorrecta"
                });
                return null;
            }

            return hashPass(nuevaContrasena);
        })
        .then(nuevoHash => {
            if (!nuevoHash) return;

            const consultaActualizar = `
                UPDATE usuarios
                SET \`contraseña\` = ?
                WHERE Id_usuario = ?
            `;

            return db.query(consultaActualizar, [
                nuevoHash,
                idUsuario
            ]);
        })
        .then(resultado => {
            if (!resultado) return;

            res.status(200).json({
                mensaje: "Contraseña actualizada correctamente"
            });
        })
        .catch(error => {
            console.error("Error al cambiar la contraseña:", error);

            res.status(500).json({
                mensaje: "Error al cambiar la contraseña"
            });
        });
});

router.delete("/eliminar-cuenta", (req, res) => {
    const idUsuario = req.user.Id_usuario;
    const { contrasenaActual } = req.body;

    if (!contrasenaActual) {
        return res.status(400).json({
            mensaje: "Ingresá tu contraseña actual"
        });
    }

    const consultaUsuario = `
        SELECT \`contraseña\`
        FROM usuarios
        WHERE Id_usuario = ?
    `;

    db.query(consultaUsuario, [idUsuario])
        .then(([resultados]) => {
            if (resultados.length === 0) {
                res.status(404).json({
                    mensaje: "No se encontró el usuario"
                });
                return null;
            }

            return verificarPass(
                contrasenaActual,
                resultados[0].contraseña
            );
        })
        .then(coincide => {
            if (coincide === null) return;

            if (!coincide) {
                res.status(400).json({
                    mensaje: "La contraseña es incorrecta"
                });
                return null;
            }

            return db.query(
                `DELETE FROM propuestas
                 WHERE id_usuario = ?
                    OR publicacion_intercambio IN (
                        SELECT Id_publicacion_intercambio
                        FROM publicaciones_intercambio pi
                        INNER JOIN prendas p
                            ON pi.id_prenda = p.id_prenda
                        WHERE p.Id_usuario = ?
                    )`,
                [idUsuario, idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE ca
                 FROM categorias_aceptadas ca
                 INNER JOIN publicaciones_intercambio pi
                    ON ca.id_publicacion_intercambio = pi.Id_publicacion_intercambio
                 INNER JOIN prendas p
                    ON pi.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE pi
                 FROM publicaciones_intercambio pi
                 INNER JOIN prendas p
                    ON pi.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE po
                 FROM prendas_outfits po
                 LEFT JOIN prendas p
                    ON po.id_prenda = p.id_prenda
                 LEFT JOIN outfits o
                    ON po.id_outfit = o.id_outfit
                 WHERE p.Id_usuario = ?
                    OR o.Id_usuario = ?`,
                [idUsuario, idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE oe
                 FROM outfit_estilo oe
                 INNER JOIN outfits o
                    ON oe.id_outfit = o.id_outfit
                 WHERE o.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE FROM outfits
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE ps
                 FROM prendas_estilos ps
                 INNER JOIN prendas p
                    ON ps.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE ci
                 FROM carrito_items ci
                 LEFT JOIN pedidos pe
                    ON ci.Id_pedido = pe.Id_pedido
                 LEFT JOIN publicaciones_compra pc
                    ON ci.id_publicacion_compra = pc.id_publicacion_compra
                 LEFT JOIN prendas p
                    ON pc.id_prenda = p.id_prenda
                 WHERE pe.id_comprador = ?
                    OR p.Id_usuario = ?`,
                [idUsuario, idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE pe
                 FROM pedidos pe
                 WHERE pe.id_comprador = ?
                    OR pe.Id_pedido IN (
                        SELECT ci.Id_pedido
                        FROM carrito_items ci
                        INNER JOIN publicaciones_compra pc
                            ON ci.id_publicacion_compra = pc.id_publicacion_compra
                        INNER JOIN prendas p
                            ON pc.id_prenda = p.id_prenda
                        WHERE p.Id_usuario = ?
                    )`,
                [idUsuario, idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE pc
                 FROM publicaciones_compra pc
                 INNER JOIN prendas p
                    ON pc.id_prenda = p.id_prenda
                 WHERE p.Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE FROM prendas
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE FROM \`notificaciónes\`
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE FROM opciones_usuarios
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            return db.query(
                `DELETE FROM usuarios
                 WHERE Id_usuario = ?`,
                [idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            res.status(200).json({
                mensaje: "La cuenta y todos sus datos fueron eliminados correctamente"
            });
        })
        .catch(error => {
            console.error("Error al eliminar cuenta:", error);

            res.status(500).json({
                mensaje: "Error al eliminar la cuenta"
            });
        });
});

router.put("/mi-cuenta/preferencias", (req, res) => {
    const idUsuario = req.user.Id_usuario;
    const { id_pregunta, opcion, seleccionada } = req.body;

    if (
        !Number.isInteger(Number(id_pregunta)) ||
        !opcion ||
        typeof seleccionada !== "boolean"
    ) {
        return res.status(400).json({
            mensaje: "Los datos de la preferencia son inválidos"
        });
    }

    const idPregunta = Number(id_pregunta);

    if (![1, 2, 3, 4, 5, 6].includes(idPregunta)) {
        return res.status(400).json({
            mensaje: "La categoría de preferencia no es válida"
        });
    }

    db.query(
        `
            SELECT id_opcion
            FROM opciones
            WHERE id_pregunta = ?
            AND opcion = ?
        `,
        [idPregunta, opcion]
    )
        .then(([resultados]) => {
            if (resultados.length === 0) {
                res.status(404).json({
                    mensaje: "No se encontró esa opción"
                });
                return null;
            }

            const idOpcion = resultados[0].id_opcion;

            if (seleccionada) {
                return db.query(
                    `
                        INSERT INTO opciones_usuarios (id_opcion, Id_usuario)
                        SELECT ?, ?
                        WHERE NOT EXISTS (
                            SELECT 1
                            FROM opciones_usuarios
                            WHERE id_opcion = ?
                            AND Id_usuario = ?
                        )
                    `,
                    [idOpcion, idUsuario, idOpcion, idUsuario]
                );
            }

            return db.query(
                `
                    DELETE FROM opciones_usuarios
                    WHERE id_opcion = ?
                    AND Id_usuario = ?
                `,
                [idOpcion, idUsuario]
            );
        })
        .then(resultado => {
            if (!resultado) return;

            res.status(200).json({
                mensaje: seleccionada
                    ? "Preferencia guardada correctamente"
                    : "Preferencia eliminada correctamente"
            });
        })
        .catch(error => {
            console.error("Error al actualizar preferencia:", error);

            res.status(500).json({
                mensaje: "Error al actualizar la preferencia"
            });
        });
});

module.exports = router;
