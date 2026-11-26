const router = require("express").Router();
const db = require("../../config/db");

// OBTENER OUTFITS
router.get("/", async (req, res) => {
  const idUsuario = req.user.id;

  try {
    const consulta = `
      SELECT
        o.id_outfit AS id,
        o.nombre,
        o.descripcion,
        o.privacidad,
        oc.ocacion AS ocasion,
        g.genero,
        t.temporada,

        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', p.id_prenda,
              'nombre', p.nombre,
              'imagen', p.imagen
            )
          )
          FROM prendas_outfits po
          INNER JOIN prendas p
            ON po.id_prenda = p.id_prenda
          WHERE po.id_outfit = o.id_outfit
        ) AS prendas

      FROM outfits o

      LEFT JOIN ocaciones oc
        ON o.id_ocasion = oc.id_ocacion

      LEFT JOIN generos g
        ON o.id_genero = g.id_genero

      LEFT JOIN temporadas t
        ON o.id_temporada = t.id_temporada

      WHERE o.Id_usuario = ?
      ORDER BY o.id_outfit DESC
    `;

    const [outfits] = await db.query(consulta, [idUsuario]);

    res.json({ outfits });
  } catch (error) {
    console.error("Error al obtener los outfits:", error);

    res.status(500).json({
      mensaje: "Error al obtener los outfits",
    });
  }
});

// OBTENER UN OUTFIT POR ID
router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const idUsuario = req.user.id;

    try {
        const consulta = `
            SELECT
                o.id_outfit AS id,
                o.nombre,
                o.descripcion,
                o.privacidad,
                oc.ocacion AS ocasion,
                g.genero,
                t.temporada,

                (
                    SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', p.id_prenda,
                            'nombre', p.nombre,
                            'imagen', p.imagen
                        )
                    )
                    FROM prendas_outfits po
                    INNER JOIN prendas p
                        ON po.id_prenda = p.id_prenda
                    WHERE po.id_outfit = o.id_outfit
                ) AS prendas

            FROM outfits o

            LEFT JOIN ocaciones oc
                ON o.id_ocasion = oc.id_ocacion

            LEFT JOIN generos g
                ON o.id_genero = g.id_genero

            LEFT JOIN temporadas t
                ON o.id_temporada = t.id_temporada

            WHERE o.id_outfit = ? AND o.Id_usuario = ?
        `;

        const [resultado] = await db.query(consulta, [id, idUsuario]);

        if (!resultado.length) {
            return res.status(404).json({
                mensaje: "Outfit no encontrado",
            });
        }

        res.json({ outfit: resultado[0] });

    } catch (error) {
        console.error("Error al obtener el outfit:", error);

        res.status(500).json({
            mensaje: "Error al obtener el outfit",
        });
    }
});

// CREAR OUTFIT
router.post("/", async (req, res) => {
  const idUsuario = req.user.id;

  try {
    const {
      nombre,
      descripcion,
      privacidad,
      temporada,
      ocasion,
      genero,
      prendas = [],
    } = req.body;

    const idsPrendas = prendas.map((prenda) =>
      Number(
        typeof prenda === "object" ? (prenda.id ?? prenda.id_prenda) : prenda,
      ),
    );

    if (
      !nombre ||
      idsPrendas.length === 0 ||
      idsPrendas.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return res.status(400).json({
        mensaje: "El nombre y al menos una prenda son obligatorios",
      });
    }

    // Comprobar que las prendas pertenezcan al usuario
    const [prendasValidas] = await db.query(
      `SELECT id_prenda FROM prendas
       WHERE Id_usuario = ? AND id_prenda IN (?)`,
      [idUsuario, idsPrendas],
    );

    if (prendasValidas.length !== idsPrendas.length) {
      return res.status(400).json({
        mensaje: "Una o más prendas no pertenecen a tu armario",
      });
    }

    // Obtener los identificadores de las etiquetas
    const [temporadas] = await db.query(
      "SELECT id_temporada FROM temporadas WHERE temporada = ?",
      [temporada],
    );

    const [ocasiones] = await db.query(
      "SELECT id_ocacion FROM ocaciones WHERE ocacion = ?",
      [ocasion],
    );

    const [generos] = await db.query(
      "SELECT id_genero FROM generos WHERE genero = ?",
      [genero],
    );

    if (!temporadas.length || !ocasiones.length || !generos.length) {
      return res.status(400).json({
        mensaje: "La temporada, ocasión o género no son válidos",
      });
    }

    // Insertar el outfit
    const consulta = `
      INSERT INTO outfits (
        Id_usuario,
        nombre,
        descripcion,
        privacidad,
        id_ocasion,
        id_genero,
        id_temporada
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [resultado] = await db.query(consulta, [
      idUsuario,
      nombre,
      descripcion || null,
      privacidad ? 1 : 0,
      ocasiones[0].id_ocacion,
      generos[0].id_genero,
      temporadas[0].id_temporada,
    ]);

    const idOutfit = resultado.insertId;

    // Relacionar las prendas con el outfit
    const valoresPrendas = idsPrendas.map((idPrenda) => [idPrenda, idOutfit]);

    await db.query(
      "INSERT INTO prendas_outfits (id_prenda, id_outfit) VALUES ?",
      [valoresPrendas],
    );

    res.status(201).json({
      mensaje: "Outfit creado correctamente",
      id_outfit: idOutfit,
    });
  } catch (error) {
    console.error("Error al crear el outfit:", error.message);

    res.status(500).json({
      mensaje: "Error al crear el outfit",
    });
  }
});

// MODIFICAR OUTFIT
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  try {
    const {
      nombre,
      descripcion,
      privacidad,
      temporada,
      ocasion,
      genero,
      prendas = [],
    } = req.body;

    const idsPrendas = prendas.map((prenda) =>
      Number(
        typeof prenda === "object" ? (prenda.id ?? prenda.id_prenda) : prenda,
      ),
    );

    if (
      !nombre ||
      idsPrendas.length === 0 ||
      idsPrendas.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      return res.status(400).json({
        mensaje: "El nombre y al menos una prenda son obligatorios",
      });
    }

    const [outfit] = await db.query(
      "SELECT id_outfit FROM outfits WHERE id_outfit = ? AND Id_usuario = ?",
      [id, idUsuario],
    );

    if (!outfit.length) {
      return res.status(404).json({
        mensaje: "Outfit no encontrado",
      });
    }

    const [prendasValidas] = await db.query(
      `SELECT id_prenda FROM prendas
       WHERE Id_usuario = ? AND id_prenda IN (?)`,
      [idUsuario, idsPrendas],
    );

    if (prendasValidas.length !== idsPrendas.length) {
      return res.status(400).json({
        mensaje: "Una o más prendas no pertenecen a tu armario",
      });
    }

    const [temporadas] = await db.query(
      "SELECT id_temporada FROM temporadas WHERE temporada = ?",
      [temporada],
    );

    const [ocasiones] = await db.query(
      "SELECT id_ocacion FROM ocaciones WHERE ocacion = ?",
      [ocasion],
    );

    const [generos] = await db.query(
      "SELECT id_genero FROM generos WHERE genero = ?",
      [genero],
    );

    if (!temporadas.length || !ocasiones.length || !generos.length) {
      return res.status(400).json({
        mensaje: "La temporada, ocasión o género no son válidos",
      });
    }

    await db.query(
      `UPDATE outfits SET
        nombre = ?,
        descripcion = ?,
        privacidad = ?,
        id_ocasion = ?,
        id_genero = ?,
        id_temporada = ?
       WHERE id_outfit = ? AND Id_usuario = ?`,
      [
        nombre,
        descripcion || null,
        privacidad ? 1 : 0,
        ocasiones[0].id_ocacion,
        generos[0].id_genero,
        temporadas[0].id_temporada,
        id,
        idUsuario,
      ],
    );

    // Reemplazar las prendas relacionadas
    await db.query("DELETE FROM prendas_outfits WHERE id_outfit = ?", [id]);

    const valoresPrendas = idsPrendas.map((idPrenda) => [idPrenda, Number(id)]);

    await db.query(
      "INSERT INTO prendas_outfits (id_prenda, id_outfit) VALUES ?",
      [valoresPrendas],
    );

    res.json({
      mensaje: "Outfit modificado correctamente",
    });
  } catch (error) {
    console.error("Error al modificar el outfit:", error);

    res.status(500).json({
      mensaje: "Error al modificar el outfit",
    });
  }
});

// ELIMINAR OUTFIT
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const idUsuario = req.user.id;

  try {
    const [outfit] = await db.query(
      "SELECT id_outfit FROM outfits WHERE id_outfit = ? AND Id_usuario = ?",
      [id, idUsuario],
    );

    if (!outfit.length) {
      return res.status(404).json({
        mensaje: "Outfit no encontrado",
      });
    }

    await db.query("DELETE FROM prendas_outfits WHERE id_outfit = ?", [id]);

    await db.query("DELETE FROM outfit_estilo WHERE id_outfit = ?", [id]);

    await db.query(
      "DELETE FROM outfits WHERE id_outfit = ? AND Id_usuario = ?",
      [id, idUsuario],
    );

    res.json({
      mensaje: "Outfit eliminado correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar el outfit:", error);

    res.status(500).json({
      mensaje: "Error al eliminar el outfit",
    });
  }
});

module.exports = router;
