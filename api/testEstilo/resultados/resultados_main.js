
const router = require("express").Router();
const db = require("../../../config/db");

router.post("/", (req, res) => {
    const { idUsuario, respuestas } = req.body;

    if (!Array.isArray(respuestas) || respuestas.length === 0) {
        return res.status(400).json({
            mensaje: "Debés responder las seis preguntas"
        });
    }

    const ids = respuestas.map(Number);

    let estilos = [];
    let idResultado;

    db.query(
        `SELECT id_opcion, id_pregunta
         FROM opciones
         WHERE id_opcion IN (?)`,
        [ids]
    )
    .then(([opciones]) => {
        const preguntas = [...new Set(
            opciones.map(opcion => Number(opcion.id_pregunta))
        )];

        if (
            opciones.length !== ids.length ||
            preguntas.length !== 6
        ) {
            throw new Error("RESPUESTAS_INVALIDAS");
        }

        return db.query(
            `DELETE FROM opciones_usuarios
             WHERE Id_usuario = ?`,
            [idUsuario]
        );
    })
    .then(() => {
        const valores = ids.map(id => [id, idUsuario]);

        return db.query(
            `INSERT INTO opciones_usuarios
             (id_opcion, Id_usuario)
             VALUES ?`,
            [valores]
        );
    })
    .then(() => {
        return db.query(
            `SELECT
                e.id_estilo,
                e.estilo,
                SUM(oe.puntaje) AS puntaje
             FROM opciones_usuarios ou
             INNER JOIN opciones o
                ON ou.id_opcion = o.id_opcion
             INNER JOIN opciones_estilos oe
                ON o.id_opcion = oe.id_opcion
             INNER JOIN estilos e
                ON oe.id_estilo = e.id_estilo
             WHERE ou.Id_usuario = ?
             AND o.id_pregunta IN (2, 4, 5, 6)
             GROUP BY e.id_estilo, e.estilo
             ORDER BY puntaje DESC`,
            [idUsuario]
        );
    })
    .then(([datos]) => {
        const total = datos.reduce(
            (suma, estilo) => suma + Number(estilo.puntaje),
            0
        );

        if (total === 0) {
            throw new Error("SIN_PUNTAJES");
        }

        estilos = datos.map(estilo => ({
            id_estilo: estilo.id_estilo,
            estilo: estilo.estilo,
            porcentaje: Number(
                (Number(estilo.puntaje) / total * 100).toFixed(2)
            )
        }));

        return db.query(
            `SELECT id_resultado
             FROM resultados
             WHERE Id_usuario = ?`,
            [idUsuario]
        );
    })
    .then(([resultado]) => {
        if (resultado.length > 0) {
            idResultado = resultado[0].id_resultado;

            return db.query(
                `DELETE FROM resultado_estilo
                 WHERE id_resultado = ?`,
                [idResultado]
            );
        }

        return db.query(
            `INSERT INTO resultados (Id_usuario)
             VALUES (?)`,
            [idUsuario]
        ).then(([nuevo]) => {
            idResultado = nuevo.insertId;
        });
    })
    .then(() => {
        const valores = estilos.map(estilo => [
            estilo.id_estilo,
            idResultado,
            estilo.porcentaje
        ]);

        return db.query(
            `INSERT INTO resultado_estilo
             (id_estilo, id_resultado, porcentaje)
             VALUES ?`,
            [valores]
        );
    })
    .then(() => {
        res.status(200).json({
            mensaje: "Test completado correctamente",
            idResultado,
            estilos
        });
    })
    .catch((error) => {
        console.error("Error al procesar el test:", error);

        if (
            error.message === "RESPUESTAS_INVALIDAS" ||
            error.message === "SIN_PUNTAJES"
        ) {
            return res.status(400).json({
                mensaje: "No se pudieron procesar las respuestas"
            });
        }

        res.status(500).json({
            mensaje: "Error al procesar el test"
        });
    });
});

module.exports = router;
