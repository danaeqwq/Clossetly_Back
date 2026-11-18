const router = require("express").Router();
const db = require("../../config/db");
const middlewareSeg = require("../middlewares/middlewareSeg");

router.get("/", (req, res) => {
  const {
    categoria,
    talle,
    temporada,
    estado,
    ocasion,
    genero,
    colores = [],
    estilos = [],
    ordenPrecio,
  } = req.query;

  // CONVERTIR LOS FILTROS EN ARRAYS
  const listaColores = Array.isArray(colores)
    ? colores
    : colores
      ? [colores]
      : [];

  const listaEstilos = Array.isArray(estilos)
    ? estilos
    : estilos
      ? [estilos]
      : [];

  // FILTROS GENERALES
  const condiciones = [];
  const valores = [];

  if (categoria && categoria !== "TODAS") {
    condiciones.push("ca.categoria = ?");
    valores.push(categoria);
  }

  if (talle && talle !== "TODOS") {
    condiciones.push("ta.talla = ?");
    valores.push(talle);
  }

  if (temporada && temporada !== "TODAS") {
    condiciones.push("te.temporada = ?");
    valores.push(temporada);
  }

  if (estado && estado !== "TODOS") {
    condiciones.push("ep.estado_prenda = ?");
    valores.push(estado);
  }

  if (ocasion && ocasion !== "TODOS") {
    condiciones.push("oc.ocacion = ?");
    valores.push(ocasion);
  }

  if (genero && genero !== "TODOS") {
    condiciones.push("g.genero = ?");
    valores.push(genero);
  }

  // FILTRO POR COLORES
  if (listaColores.length > 0) {
    condiciones.push("co.color IN (?)");
    valores.push(listaColores);
  }

  // FILTRO POR ESTILOS
  if (listaEstilos.length > 0) {
    condiciones.push(`
            EXISTS (
                SELECT 1
                FROM prendas_estilos pe
                INNER JOIN estilos e
                    ON pe.id_estilo = e.id_estilo
                WHERE pe.id_prenda = p.id_prenda
                AND e.estilo IN (?)
            )
        `);

    valores.push(listaEstilos);
  }

  let where = "";

  if (condiciones.length > 0) {
    where = `AND ${condiciones.join(" AND ")}`;
  }

  // ORDENAMIENTO
  let orden = "pc.id_publicacion_compra DESC";

  if (ordenPrecio === "MENOR MAYOR") {
    orden = "pc.precio_unitario ASC";
  } else if (ordenPrecio === "MAYOR MENOR") {
    orden = "pc.precio_unitario DESC";
  }

  // CONSULTA PRINCIPAL
  const consulta = `
        SELECT
            pc.id_publicacion_compra AS id,
            'compra' AS tipo,
            pc.precio_unitario AS precio,
            NULL AS talleBuscado,
            NULL AS estadoMinimoAceptado,
            JSON_ARRAY() AS tiposAceptados,

            p.id_prenda AS idPrenda,
            p.nombre,
            ta.talla AS talle,
            ep.estado_prenda AS estado,
            pc.stock,
            p.privacidad,
            p.imagen,

            u.Id_usuario AS idUsuario,
            u.nombre AS usuario,

            g.genero,
            ca.id_categoria AS idCategoria,
            ca.categoria AS prenda,
            co.color AS color,
            co.codigo AS codigoColor,
            te.temporada,
            oc.ocacion AS ocasion

        FROM publicaciones_compra pc

        INNER JOIN prendas p
            ON pc.id_prenda = p.id_prenda

        INNER JOIN usuarios u
            ON p.Id_usuario = u.Id_usuario

        LEFT JOIN categorias ca
            ON p.id_categoria = ca.id_categoria

        LEFT JOIN colores co
            ON p.id_color = co.id_color

        LEFT JOIN tallas ta
            ON p.id_talla = ta.id_talla

        LEFT JOIN estados_prenda ep
            ON p.id_estado_prenda = ep.id_estado_prenda

        LEFT JOIN temporadas te
            ON p.id_temporada = te.id_temporada

        LEFT JOIN generos g
            ON p.id_genero = g.id_genero

        LEFT JOIN ocaciones oc
            ON p.id_ocacion = oc.id_ocacion

        WHERE p.privacidad = 1
        ${where}

        ORDER BY ${orden}
    `;

  db.query(consulta, valores)
    .then(([publicaciones]) => {
      res.json({ publicaciones });
    })
    .catch((error) => {
      console.error("Error al obtener publicaciones de compra:", error);

      res.status(500).json({
        mensaje: "Error al obtener las publicaciones de compra",
      });
    });
});

router.get("/:id", (req, res) => {
  const { id } = req.params;

  const consulta = `
        SELECT
            pc.id_publicacion_compra AS id,
            'compra' AS tipo,
            pc.precio_unitario AS precio,
            pc.stock,

            p.id_prenda AS idPrenda,
            p.nombre,
            p.imagen,
            p.privacidad,

            ta.talla AS talle,
            ep.estado_prenda AS estado,
            g.genero,
            ca.id_categoria AS idCategoria,
            ca.categoria AS prenda,
            co.color AS color,
            co.codigo AS codigoColor,
            te.temporada,
            oc.ocacion AS ocasion,

            u.Id_usuario AS idUsuario,
            u.nombre AS usuario,
            u.foto_perfil AS fotoPerfil

        FROM publicaciones_compra pc

        INNER JOIN prendas p
            ON pc.id_prenda = p.id_prenda

        INNER JOIN usuarios u
            ON p.Id_usuario = u.Id_usuario

        LEFT JOIN categorias ca
            ON p.id_categoria = ca.id_categoria

        LEFT JOIN colores co
            ON p.id_color = co.id_color

        LEFT JOIN tallas ta
            ON p.id_talla = ta.id_talla

        LEFT JOIN estados_prenda ep
            ON p.id_estado_prenda = ep.id_estado_prenda

        LEFT JOIN temporadas te
            ON p.id_temporada = te.id_temporada

        LEFT JOIN generos g
            ON p.id_genero = g.id_genero

        LEFT JOIN ocaciones oc
            ON p.id_ocacion = oc.id_ocacion

        WHERE pc.id_publicacion_compra = ?
        AND p.privacidad = 1
    `;

  db.query(consulta, [id])
    .then(([resultados]) => {
      if (resultados.length === 0) {
        return res.status(404).json({
          mensaje: "Publicación no encontrada",
        });
      }

      res.json({ publicacion: resultados[0] });
    })
    .catch((error) => {
      console.error("Error al obtener detalle de compra:", error);

      res.status(500).json({
        mensaje: "Error al obtener el detalle de la publicación",
      });
    });
});

router.post("/", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;

  try {
    const { id_prenda, stock, precio_unitario } = req.body;

    if (
      !Number.isInteger(Number(id_prenda)) ||
      !Number.isInteger(Number(stock)) ||
      Number(stock) <= 0 ||
      !Number.isFinite(Number(precio_unitario)) ||
      Number(precio_unitario) <= 0
    ) {
      return res.status(400).json({
        mensaje: "Los datos de la publicación no son válidos",
      });
    }

    // Comprobar que la prenda pertenece al usuario
    const [prendas] = await db.query(
      `SELECT id_prenda
       FROM prendas
       WHERE id_prenda = ? AND Id_usuario = ?`,
      [id_prenda, idUsuario],
    );

    if (prendas.length === 0) {
      return res.status(403).json({
        mensaje: "No podés publicar una prenda que no te pertenece",
      });
    }

    const [resultado] = await db.query(
      `INSERT INTO publicaciones_compra
       (id_prenda, stock, precio_unitario)
       VALUES (?, ?, ?)`,
      [id_prenda, stock, precio_unitario],
    );

    res.status(201).json({
      mensaje: "Publicación de compra creada correctamente",
      id: resultado.insertId,
    });
  } catch (error) {
    console.error("Error al crear publicación de compra:", error);

    res.status(500).json({
      mensaje: "Error al crear la publicación",
    });
  }
});

router.put("/:id", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.params.id;

  try {
    const { stock, precio_unitario } = req.body;

    if (
      !Number.isInteger(Number(stock)) ||
      Number(stock) <= 0 ||
      !Number.isFinite(Number(precio_unitario)) ||
      Number(precio_unitario) <= 0
    ) {
      return res.status(400).json({
        mensaje: "Los datos ingresados no son válidos",
      });
    }

    const [publicaciones] = await db.query(
      `SELECT pc.id_publicacion_compra
       FROM publicaciones_compra pc
       INNER JOIN prendas p ON pc.id_prenda = p.id_prenda
       WHERE pc.id_publicacion_compra = ?
       AND p.Id_usuario = ?`,
      [idPublicacion, idUsuario],
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({
        mensaje: "No se encontró la publicación",
      });
    }

    await db.query(
      `UPDATE publicaciones_compra
       SET stock = ?, precio_unitario = ?
       WHERE id_publicacion_compra = ?`,
      [stock, precio_unitario, idPublicacion],
    );

    res.json({
      mensaje: "Publicación de compra modificada correctamente",
    });
  } catch (error) {
    console.error("Error al modificar publicación de compra:", error);

    res.status(500).json({
      mensaje: "Error al modificar la publicación",
    });
  }
});

router.delete("/:id", middlewareSeg, async (req, res) => {
  const idUsuario = req.user.id;
  const idPublicacion = req.params.id;

  try {
    // Comprobar que la publicación pertenece al usuario
    const [publicaciones] = await db.query(
      `SELECT pc.id_publicacion_compra
       FROM publicaciones_compra pc
       INNER JOIN prendas p ON pc.id_prenda = p.id_prenda
       WHERE pc.id_publicacion_compra = ?
       AND p.Id_usuario = ?`,
      [idPublicacion, idUsuario],
    );

    if (publicaciones.length === 0) {
      return res.status(404).json({
        mensaje: "No se encontró la publicación",
      });
    }

    await db.query(
      `DELETE FROM publicaciones_compra
       WHERE id_publicacion_compra = ?`,
      [idPublicacion],
    );

    res.json({
      mensaje: "Publicación de compra eliminada correctamente",
    });
  } catch (error) {
    console.error("Error al eliminar publicación de compra:", error);

    res.status(500).json({
      mensaje: "Error al eliminar la publicación",
    });
  }
});

module.exports = router;
