const router = require("express").Router();

const middlewareSeg = require("./middlewares/middlewareSeg");
const middlewareRol = require("./middlewares/middlewareRol");

const compraRouter = require("./publicaciones/publicaciones_compra_main");
const intercambioRouter = require("./publicaciones/publicaciones_intercambio_main");
const filtrosRouter = require("./filtros/filtros_main");
const pedidoRouter = require("./pedidos/pedidos_main");
const prendasRouter = require("./prendas/prendas_main");
const outfitsRouter = require("./outfits/outfits_main");
const usuarioRouter = require("./usuarios/usuarios_main");

const categoriasRouter = require("./categorias/categorias_main");

const loginRouter = require("./auth/login");
const registroRouter = require("./auth/registro");

// RUTAS PÚBLICAS
router.use("/login", loginRouter);
router.use("/registro", registroRouter);

// RUTAS PROTEGIDAS: USUARIOS CON SESIÓN
router.use("/publicaciones/compra", middlewareSeg, compraRouter);
router.use("/publicaciones/intercambio", middlewareSeg, intercambioRouter);
router.use("/filtros", middlewareSeg, filtrosRouter);
router.use("/pedidos", middlewareSeg, pedidoRouter);
router.use("/prendas", middlewareSeg, prendasRouter);
router.use("/categorias", middlewareSeg, categoriasRouter);
router.use("/outfits", outfitsRouter);
router.use("/usuarios", middlewareSeg, usuarioRouter);
// RUTAS DE ADMINISTRACIÓN
router.use("/admin", middlewareSeg, middlewareRol("Admin"));

module.exports = router;