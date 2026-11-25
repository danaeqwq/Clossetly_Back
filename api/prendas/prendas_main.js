const router = require("express").Router();
const db = require("../../config/db");

router.get("/", (req, res) => {
  const idUsuario = req.user.id;
  const consulta = `
    SELECT
        p.id_prenda AS id,
        p.nombre,
        p.imagen,
        p.privacidad,

        ca.categoria,
        ta.talla AS talle,
        te.temporada,
        ep.estado_prenda AS estado,
        oc.ocacion AS ocasion,
        g.genero,

        co.color,
        co.codigo AS codigoColor,
        JSON_ARRAYAGG(e.estilo) AS estilos

    FROM prendas p

    LEFT JOIN categorias ca ON p.id_categoria = ca.id_categoria
    LEFT JOIN tallas ta ON p.id_talla = ta.id_talla
    LEFT JOIN temporadas te ON p.id_temporada = te.id_temporada
    LEFT JOIN estados_prenda ep ON p.id_estado_prenda = ep.id_estado_prenda
    LEFT JOIN ocaciones oc ON p.id_ocacion = oc.id_ocacion
    LEFT JOIN generos g ON p.id_genero = g.id_genero
    LEFT JOIN colores co ON p.id_color = co.id_color
    LEFT JOIN prendas_estilos pe ON p.id_prenda = pe.id_prenda
    LEFT JOIN estilos e ON pe.id_estilo = e.id_estilo

    WHERE p.id_usuario = ?

    GROUP BY p.id_prenda
    ORDER BY p.id_prenda DESC
`;

  db.query(consulta, [idUsuario])
    .then(([prendas]) => {
      res.json({ prendas });
    })
    .catch((error) => {
      console.error("Error al obtener las prendas:", error);

      res.status(500).json({
        mensaje: "Error al obtener las prendas",
      });
    });
});

router.post("/", async (req, res) => {
  const idUsuario = req.user.id;

  try {
    const {
      nombre,
      categoria,
      talle,
      temporada,
      ocasion,
      genero,
      estado,
      privacidad,
      colores = [],
      estilos = [],
    } = req.body;

    // PROCESAR COLORES Y ESTILOS
    const listaColores = Array.isArray(colores)
      ? colores
      : typeof colores === "string" && colores
        ? JSON.parse(colores)
        : [];

    const listaEstilos = Array.isArray(estilos)
      ? estilos
      : typeof estilos === "string" && estilos
        ? JSON.parse(estilos)
        : [];

    // GUARDAR IMAGEN
    let rutaImagen = null;
    const archivo = req.files?.imagen;

    if (archivo) {
      const nombreArchivo = `${Date.now()}-${archivo.name}`;
      const carpeta = "uploads/prendas/";

      await archivo.mv(carpeta + nombreArchivo);

      rutaImagen = `/uploads/prendas/${nombreArchivo}`;
    }

    // INSERTAR PRENDA
    const consulta = `
      INSERT INTO prendas (
        Id_usuario,
        id_genero,
        id_temporada,
        id_color,
        nombre,
        privacidad,
        id_estado_prenda,
        id_talla,
        imagen,
        id_ocacion,
        id_categoria
      )
      VALUES (
        ?,
        (SELECT id_genero FROM generos WHERE genero = ?),
        (SELECT id_temporada FROM temporadas WHERE temporada = ?),
        (SELECT id_color FROM colores WHERE color = ?),
        ?,
        ?,
        (SELECT id_estado_prenda FROM estados_prenda WHERE estado_prenda = ?),
        (SELECT id_talla FROM tallas WHERE talla = ?),
        ?,
        (SELECT id_ocacion FROM ocaciones WHERE ocacion = ?),
        (SELECT id_categoria FROM categorias WHERE categoria = ?)
      )
    `;

    const valores = [
      idUsuario,
      genero,
      temporada,
      listaColores[0],
      nombre,
      privacidad,
      estado,
      talle,
      rutaImagen,
      ocasion,
      categoria,
    ];

    const [resultado] = await db.query(consulta, valores);

    const idPrenda = resultado.insertId;

    // GUARDAR ESTILOS
    if (listaEstilos.length > 0) {
      const consultaEstilos = `
        INSERT INTO prendas_estilos (id_prenda, id_estilo)
        SELECT ?, id_estilo
        FROM estilos
        WHERE estilo IN (?)
      `;

      await db.query(consultaEstilos, [idPrenda, listaEstilos]);
    }

    res.status(201).json({
      mensaje: "Prenda creada correctamente",
      id_prenda: idPrenda,
      imagen: rutaImagen,
    });
  } catch (error) {
    console.error("Error al crear la prenda:", error);

    res.status(500).json({
      mensaje: "Error al crear la prenda",
    });
  }
});

router.post("/", (req, res) => {
    const idUsuario = req.user.id;
    const {
        nombre,
        categoria,
        talle,
        temporada,
        ocasion,
        genero,
        estado,
        privacidad,
        colores = [],
        estilos = [],
    } = req.body;

    // PROCESAR COLORES Y ESTILOS
    const listaColores = Array.isArray(colores)
        ? colores
        : typeof colores === "string" && colores
            ? JSON.parse(colores)
            : [];

    const listaEstilos = Array.isArray(estilos)
        ? estilos
        : typeof estilos === "string" && estilos
            ? JSON.parse(estilos)
            : [];

    // GUARDAR IMAGEN
    let rutaImagen = null;
    const archivo = req.files?.imagen;

    let promesaImagen;

    if (archivo) {
        const nombreArchivo = `${Date.now()}-${archivo.name}`;
        const carpeta = "uploads/prendas/";

        promesaImagen = archivo.mv(carpeta + nombreArchivo)
            .then(() => {
                rutaImagen = `/uploads/prendas/${nombreArchivo}`;
            });
    } else {
        promesaImagen = Promise.resolve();
    }

    promesaImagen
        .then(() => {

            // INSERTAR PRENDA
            const consulta = `
                INSERT INTO prendas (
                    Id_usuario,
                    id_genero,
                    id_temporada,
                    id_color,
                    nombre,
                    privacidad,
                    id_estado_prenda,
                    id_talla,
                    imagen,
                    id_ocacion,
                    id_categoria
                )
                VALUES (
                    ?,
                    (SELECT id_genero FROM generos WHERE genero = ?),
                    (SELECT id_temporada FROM temporadas WHERE temporada = ?),
                    (SELECT id_color FROM colores WHERE color = ?),
                    ?,
                    ?,
                    (SELECT id_estado_prenda FROM estados_prenda WHERE estado_prenda = ?),
                    (SELECT id_talla FROM tallas WHERE talla = ?),
                    ?,
                    (SELECT id_ocacion FROM ocaciones WHERE ocacion = ?),
                    (SELECT id_categoria FROM categorias WHERE categoria = ?)
                )
            `;

            const valores = [
                idUsuario,
                genero,
                temporada,
                listaColores[0],
                nombre,
                privacidad,
                estado,
                talle,
                rutaImagen,
                ocasion,
                categoria,
            ];

            return db.query(consulta, valores);
        })
        .then(([resultado]) => {

            const idPrenda = resultado.insertId;

            // GUARDAR ESTILOS
            if (listaEstilos.length > 0) {
                const consultaEstilos = `
                    INSERT INTO prendas_estilos (id_prenda, id_estilo)
                    SELECT ?, id_estilo
                    FROM estilos
                    WHERE estilo IN (?)
                `;

                return db.query(consultaEstilos, [idPrenda, listaEstilos])
                    .then(() => idPrenda);
            }

            return idPrenda;
        })
        .then((idPrenda) => {

            // RESPUESTA EXITOSA
            res.status(201).json({
                mensaje: "Prenda creada correctamente",
                id_prenda: idPrenda,
                imagen: rutaImagen,
            });

        })
        .catch((error) => {

            // MANEJO DE ERRORES
            console.error("Error al crear la prenda:", error);

            res.status(500).json({
                mensaje: "Error al crear la prenda",
            });

        });
});

router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  const consultaEstilos = `
        DELETE pe
        FROM prendas_estilos pe
        INNER JOIN prendas p
            ON pe.id_prenda = p.id_prenda
        WHERE p.id_prenda = ?
        AND p.Id_usuario = ?
    `;

  const consultaPrenda = `
        DELETE FROM prendas
        WHERE id_prenda = ?
        AND Id_usuario = ?
    `;

  db.query(consultaEstilos, [id, idUsuario])
    .then(() => {
      return db.query(consultaPrenda, [id, idUsuario]);
    })
    .then(([resultado]) => {
      if (resultado.affectedRows === 0) {
        return res.status(404).json({
          mensaje: "Prenda no encontrada",
        });
      }

      res.json({
        mensaje: "Prenda eliminada correctamente",
      });
    })
    .catch((error) => {
      console.error("Error al eliminar la prenda:", error);

      res.status(500).json({
        mensaje: "Error al eliminar la prenda",
      });
    });
});

module.exports = router;
