-- ============================================
-- Migración 009: Row Level Security (RLS)
-- ============================================

-- ========================
-- PERFILES
-- ========================
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven su propio perfil"
  ON perfiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Staff ve todos los perfiles"
  ON perfiles FOR SELECT
  USING (es_staff());

CREATE POLICY "Usuario actualiza su perfil"
  ON perfiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Secretaría actualiza perfiles"
  ON perfiles FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

CREATE POLICY "Secretaría inserta perfiles"
  ON perfiles FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- ROLES
-- ========================
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos pueden ver roles"
  ON roles FOR SELECT
  USING (true);

-- ========================
-- PERFIL_ROLES
-- ========================
ALTER TABLE perfil_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus propios roles"
  ON perfil_roles FOR SELECT
  USING (auth.uid() = perfil_id);

CREATE POLICY "Staff ve todos los roles de perfiles"
  ON perfil_roles FOR SELECT
  USING (es_staff());

CREATE POLICY "Admin y secretaría asignan roles"
  ON perfil_roles FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

CREATE POLICY "Admin y secretaría eliminan roles"
  ON perfil_roles FOR DELETE
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- DISCIPLINAS
-- ========================
ALTER TABLE disciplinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven disciplinas activas"
  ON disciplinas FOR SELECT
  USING (activa = true);

CREATE POLICY "Staff ve todas las disciplinas"
  ON disciplinas FOR SELECT
  USING (es_staff());

CREATE POLICY "Secretaría gestiona disciplinas"
  ON disciplinas FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- PERFIL_DISCIPLINAS
-- ========================
ALTER TABLE perfil_disciplinas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus disciplinas"
  ON perfil_disciplinas FOR SELECT
  USING (auth.uid() = perfil_id);

CREATE POLICY "Staff ve todas las inscripciones"
  ON perfil_disciplinas FOR SELECT
  USING (es_staff());

CREATE POLICY "Secretaría gestiona inscripciones"
  ON perfil_disciplinas FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- PAGOS_SOCIOS
-- ========================
ALTER TABLE pagos_socios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Socio ve sus pagos"
  ON pagos_socios FOR SELECT
  USING (auth.uid() = perfil_id);

CREATE POLICY "Staff ve todos los pagos de socios"
  ON pagos_socios FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

CREATE POLICY "Secretaría registra pagos"
  ON pagos_socios FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'secretaria']));

-- ========================
-- CATEGORIAS_PRODUCTO
-- ========================
ALTER TABLE categorias_producto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven categorías activas"
  ON categorias_producto FOR SELECT
  USING (activa = true);

CREATE POLICY "Staff ve todas las categorías"
  ON categorias_producto FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona categorías"
  ON categorias_producto FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PRODUCTOS
-- ========================
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven productos activos"
  ON productos FOR SELECT
  USING (activo = true);

CREATE POLICY "Staff ve todos los productos"
  ON productos FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona productos"
  ON productos FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PRODUCTO_VARIANTES
-- ========================
ALTER TABLE producto_variantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven variantes de productos activos"
  ON producto_variantes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM productos p
      WHERE p.id = producto_id AND p.activo = true
    )
  );

CREATE POLICY "Staff ve todas las variantes"
  ON producto_variantes FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona variantes"
  ON producto_variantes FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PRODUCTO_IMAGENES
-- ========================
ALTER TABLE producto_imagenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven imágenes de productos"
  ON producto_imagenes FOR SELECT
  USING (true);

CREATE POLICY "Tienda gestiona imágenes"
  ON producto_imagenes FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PEDIDOS
-- ========================
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus pedidos"
  ON pedidos FOR SELECT
  USING (auth.uid() = perfil_id);

CREATE POLICY "Staff de tienda ve todos los pedidos"
  ON pedidos FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Usuarios crean pedidos"
  ON pedidos FOR INSERT
  WITH CHECK (auth.uid() = perfil_id OR tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda actualiza pedidos"
  ON pedidos FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PEDIDO_ITEMS
-- ========================
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve items de sus pedidos"
  ON pedido_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pedidos p
      WHERE p.id = pedido_id AND p.perfil_id = auth.uid()
    )
  );

CREATE POLICY "Staff de tienda ve todos los items"
  ON pedido_items FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Insertar items de pedido"
  ON pedido_items FOR INSERT
  WITH CHECK (true);

-- ========================
-- STOCK_MOVIMIENTOS
-- ========================
ALTER TABLE stock_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de tienda ve movimientos de stock"
  ON stock_movimientos FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Staff de tienda crea movimientos"
  ON stock_movimientos FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PAGOS_MERCADOPAGO
-- ========================
ALTER TABLE pagos_mercadopago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff ve pagos MP"
  ON pagos_mercadopago FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda', 'eventos']));

CREATE POLICY "Sistema inserta pagos MP"
  ON pagos_mercadopago FOR INSERT
  WITH CHECK (true);

-- ========================
-- PROVEEDORES
-- ========================
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de tienda ve proveedores"
  ON proveedores FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona proveedores"
  ON proveedores FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PRODUCTO_PROVEEDORES
-- ========================
ALTER TABLE producto_proveedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de tienda ve relaciones proveedor-producto"
  ON producto_proveedores FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona relaciones"
  ON producto_proveedores FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- COMPRAS_PROVEEDOR
-- ========================
ALTER TABLE compras_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de tienda ve compras"
  ON compras_proveedor FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona compras"
  ON compras_proveedor FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- COMPRA_ITEMS
-- ========================
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de tienda ve items de compra"
  ON compra_items FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda gestiona items de compra"
  ON compra_items FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- PAGOS_PROVEEDOR
-- ========================
ALTER TABLE pagos_proveedor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de tienda ve pagos a proveedores"
  ON pagos_proveedor FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

CREATE POLICY "Tienda registra pagos a proveedores"
  ON pagos_proveedor FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'tienda']));

-- ========================
-- EVENTOS
-- ========================
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven eventos publicados"
  ON eventos FOR SELECT
  USING (estado = 'publicado');

CREATE POLICY "Staff ve todos los eventos"
  ON eventos FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos']));

CREATE POLICY "Staff de eventos gestiona eventos"
  ON eventos FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos']));

-- ========================
-- TIPO_ENTRADAS
-- ========================
ALTER TABLE tipo_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven tipos de entrada de eventos publicados"
  ON tipo_entradas FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM eventos e
      WHERE e.id = evento_id AND e.estado = 'publicado'
    )
  );

CREATE POLICY "Staff ve todos los tipos de entrada"
  ON tipo_entradas FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos']));

CREATE POLICY "Staff de eventos gestiona tipos"
  ON tipo_entradas FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos']));

-- ========================
-- LOTES_ENTRADA
-- ========================
ALTER TABLE lotes_entrada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven lotes activos de eventos publicados"
  ON lotes_entrada FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tipo_entradas te
      JOIN eventos e ON e.id = te.evento_id
      WHERE te.id = tipo_entrada_id AND e.estado = 'publicado'
    )
  );

CREATE POLICY "Staff ve todos los lotes"
  ON lotes_entrada FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos']));

CREATE POLICY "Staff de eventos gestiona lotes"
  ON lotes_entrada FOR ALL
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos']));

-- ========================
-- ENTRADAS
-- ========================
ALTER TABLE entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve sus entradas"
  ON entradas FOR SELECT
  USING (auth.uid() = perfil_id);

CREATE POLICY "Staff de eventos ve todas las entradas"
  ON entradas FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos', 'scanner']));

CREATE POLICY "Usuarios compran entradas"
  ON entradas FOR INSERT
  WITH CHECK (auth.uid() = perfil_id OR tiene_algun_rol(ARRAY['super_admin', 'eventos']));

CREATE POLICY "Staff actualiza entradas"
  ON entradas FOR UPDATE
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos', 'scanner']));

-- ========================
-- ESCANEOS_ENTRADA
-- ========================
ALTER TABLE escaneos_entrada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff de eventos ve escaneos"
  ON escaneos_entrada FOR SELECT
  USING (tiene_algun_rol(ARRAY['super_admin', 'eventos', 'scanner']));

CREATE POLICY "Scanner registra escaneos"
  ON escaneos_entrada FOR INSERT
  WITH CHECK (tiene_algun_rol(ARRAY['super_admin', 'eventos', 'scanner']));

-- ========================
-- CONTENIDO_PAGINAS
-- ========================
ALTER TABLE contenido_paginas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven contenido activo"
  ON contenido_paginas FOR SELECT
  USING (activo = true);

CREATE POLICY "Admin gestiona contenido"
  ON contenido_paginas FOR ALL
  USING (tiene_rol('super_admin'));

-- ========================
-- MEMORIAS
-- ========================
ALTER TABLE memorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven memorias"
  ON memorias FOR SELECT
  USING (true);

CREATE POLICY "Admin gestiona memorias"
  ON memorias FOR ALL
  USING (tiene_rol('super_admin'));

-- ========================
-- DIRECTIVOS
-- ========================
ALTER TABLE directivos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos ven directivos activos"
  ON directivos FOR SELECT
  USING (activo = true);

CREATE POLICY "Admin gestiona directivos"
  ON directivos FOR ALL
  USING (tiene_rol('super_admin'));
