CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Comment_content_idx" ON "Comment" USING GIN ("content" gin_trgm_ops);

CREATE INDEX "Image_name_idx" ON "Image" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "Project_name_idx" ON "Project" USING GIN ("name" gin_trgm_ops);

CREATE INDEX "ImageVersion_versionName_idx" ON "ImageVersion" USING GIN ("versionName" gin_trgm_ops);
