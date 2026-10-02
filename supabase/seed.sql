-- ============================================
-- Seed: Datos iniciales de Club Seminario
-- ============================================

-- Roles del sistema
INSERT INTO roles (nombre, descripcion) VALUES
  ('super_admin', 'Acceso total al sistema'),
  ('tienda', 'Administración de tienda, stock y POS'),
  ('secretaria', 'Gestión de socios y disciplinas'),
  ('eventos', 'Gestión de eventos y entradas'),
  ('scanner', 'Escaneo de QR en eventos'),
  ('socio', 'Socio activo del club'),
  ('no_socio', 'Usuario registrado sin membresía'),
  ('tesorero', 'Tesorería y contabilidad');

-- Disciplinas deportivas (las de producción al 2026-10-02)
INSERT INTO disciplinas (nombre, slug) VALUES
  ('Básquetbol', 'basquetbol'),
  ('Corredores', 'corredores'),
  ('Fútbol Femenino', 'futbol-femenino'),
  ('Fútbol Masculino', 'futbol-masculino'),
  ('Handball Femenino', 'handball-femenino'),
  ('Handball Masculino', 'handball-masculino'),
  ('Hockey Femenino', 'hockey-femenino'),
  ('Mami Fútbol', 'mami-futbol'),
  ('Mami handball', 'mami-handball'),
  ('Mami Hockey', 'mami-hockey'),
  ('Mami Volley', 'mami-volley'),
  ('Papi Basquet', 'papi-basquet'),
  ('Rugby', 'rugby'),
  ('Social', 'social');

-- Memorias anuales (2014-2024)
INSERT INTO memorias (anio, titulo, archivo_url) VALUES
  (2014, 'Memoria Anual 2014', 'memorias/memoria-2014.pdf'),
  (2015, 'Memoria Anual 2015', 'memorias/memoria-2015.pdf'),
  (2016, 'Memoria Anual 2016', 'memorias/memoria-2016.pdf'),
  (2017, 'Memoria Anual 2017', 'memorias/memoria-2017.pdf'),
  (2018, 'Memoria Anual 2018', 'memorias/memoria-2018.pdf'),
  (2019, 'Memoria Anual 2019', 'memorias/memoria-2019.pdf'),
  (2020, 'Memoria Anual 2020', 'memorias/memoria-2020.pdf'),
  (2021, 'Memoria Anual 2021', 'memorias/memoria-2021.pdf'),
  (2022, 'Memoria Anual 2022', 'memorias/memoria-2022.pdf'),
  (2023, 'Memoria Anual 2023', 'memorias/memoria-2023.pdf'),
  (2024, 'Memoria Anual 2024', 'memorias/memoria-2024.pdf');

-- Contenido de páginas institucionales
INSERT INTO contenido_paginas (pagina, seccion, titulo, contenido, orden) VALUES
  ('inicio', 'hero', 'Club Seminario',
   'Club deportivo, social y cultural de la comunidad jesuita en Uruguay', 1),

  ('inicio', 'quienes-somos', 'Quiénes somos',
   'Club Seminario es una institución deportiva, social y cultural que nuclea a la comunidad jesuita en Uruguay, fundada el 13 de mayo de 2010. Cuenta con más de 1.000 socios que compiten en 22 categorías a través de rugby, hockey, fútbol, handball, básquetbol y vóleibol, además de un grupo de corredores.', 2),

  ('inicio', 'mision', 'Nuestra misión',
   'Brindar a sus socios y socias espacios para la práctica deportiva, actividades culturales y sociales, promoviendo valores cristianos y el desarrollo físico y espiritual.', 3),

  ('inicio', 'deporte', 'El deporte como herramienta',
   'Los atletas participan en más de 600 partidos anuales a través de la Liga Universitaria de Deportes (LUD), ADIC, URU, AUF, FUHC y la Asociación Uruguaya de Handball.', 4),

  ('inicio', 'cita', NULL,
   'La vida es como un gran partido donde solo se puede sentir satisfacción sabiendo que se dio todo...', 5),

  ('instalaciones', 'parque-cupra', 'Parque CUPRA',
   'Ubicación principal del club para actividades deportivas. Canchas disponibles para las distintas disciplinas.', 1),

  ('instalaciones', 'sede-administrativa', 'Sede Administrativa',
   'Colegio Seminario (Soriano 1472) — sede administrativa y oficinas del club.', 2),

  ('socios', 'info', 'Hacete socio',
   'Ser socio del Club Seminario te permite participar en todas las disciplinas deportivas, acceder a beneficios exclusivos y ser parte de la comunidad.', 1),

  ('socios', 'tipos', 'Tipos de membresía',
   'Socio Colaborador: Apoya al club sin participar en actividades deportivas. Socio Deportivo: Participa activamente en una o más disciplinas deportivas.', 2),

  ('socios', 'contacto', 'Contacto Secretaría',
   'Teléfono: +598 91 965 438. Email: secretaria@clubseminario.com.uy. Horario: Martes, Jueves y Viernes de 12:30 a 15:30 hs. Dirección: Soriano 1472, Montevideo.', 3),

  ('beneficios', 'tarjeta', 'Tarjeta de Membresía',
   'Como socio del club, accedés a descuentos exclusivos en comercios asociados presentando tu carnet digital.', 1);
