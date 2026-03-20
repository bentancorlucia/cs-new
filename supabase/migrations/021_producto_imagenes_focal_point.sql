-- Add focal_point column to producto_imagenes
-- Stores the CSS object-position value (e.g. "50% 30%") for controlling image crop
ALTER TABLE producto_imagenes
ADD COLUMN focal_point text DEFAULT '50% 50%';
