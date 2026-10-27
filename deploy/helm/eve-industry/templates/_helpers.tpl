{{- define "eve.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "eve.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "eve.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "eve.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ include "eve.imageTag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels for one component: include "eve.selectorLabels" (list . "web") */}}
{{- define "eve.selectorLabels" -}}
{{- $ := index . 0 -}}
app.kubernetes.io/name: {{ include "eve.name" $ }}
app.kubernetes.io/instance: {{ $.Release.Name }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end -}}

{{- define "eve.imageTag" -}}
{{- default .Chart.AppVersion .Values.image.tag -}}
{{- end -}}

{{- define "eve.image" -}}
{{- printf "%s:%s" .Values.image.repository (include "eve.imageTag" .) -}}
{{- end -}}

{{- define "eve.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "eve.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "eve.secretName" -}}
{{- default (printf "%s-app" (include "eve.fullname" .)) .Values.existingSecret -}}
{{- end -}}

{{- define "eve.dbHost" -}}
{{- if .Values.mysql.enabled -}}
{{- printf "%s-mysql" (include "eve.fullname" .) -}}
{{- else -}}
{{- required "externalDatabase.host is required when mysql.enabled is false" .Values.externalDatabase.host -}}
{{- end -}}
{{- end -}}

{{/* Restart pods when the settings or the chart-managed Secret change. */}}
{{- define "eve.checksums" -}}
checksum/config: {{ include (print .Template.BasePath "/configmap.yaml") . | sha256sum }}
{{- if not .Values.existingSecret }}
checksum/secret: {{ include (print .Template.BasePath "/secret.yaml") . | sha256sum }}
{{- end }}
{{- end -}}

{{/* Pod-level settings shared by every app pod. */}}
{{- define "eve.podSpec" -}}
serviceAccountName: {{ include "eve.serviceAccountName" . }}
automountServiceAccountToken: false
{{- with .Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
securityContext:
  {{- toYaml .Values.podSecurityContext | nindent 2 }}
{{- end -}}

{{/* Container for one role: include "eve.container" (dict "root" . "role" "web" "name" "web" "resources" .Values.web.resources) */}}
{{- define "eve.container" -}}
{{- $ := .root -}}
- name: {{ .name | default .role }}
  image: {{ include "eve.image" $ }}
  imagePullPolicy: {{ $.Values.image.pullPolicy }}
  env:
    - name: APP_ROLE
      value: {{ .role }}
    {{- with .extraEnv }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
  envFrom:
    - configMapRef:
        name: {{ include "eve.fullname" $ }}
    - secretRef:
        name: {{ include "eve.secretName" $ }}
  securityContext:
    {{- toYaml $.Values.securityContext | nindent 4 }}
  {{- with .resources }}
  resources:
    {{- toYaml . | nindent 4 }}
  {{- end }}
  volumeMounts:
    {{- include "eve.volumeMounts" . | nindent 4 }}
{{- end -}}

{{/* Waits for the migrate Job: pods start only once the schema is current. */}}
{{- define "eve.awaitMigrations" -}}
{{- include "eve.container" (dict "root" . "role" "await-migrations" "resources" .Values.migrate.resources) }}
{{- end -}}

{{/*
Writable paths. The root filesystem is read-only: /tmp (nginx, uploads),
storage/ (compiled views, logs, downloads) and bootstrap/cache (config:cache)
are emptyDirs; web pods add the uploads volume and custom themes.
*/}}
{{- define "eve.volumeMounts" -}}
- name: tmp
  mountPath: /tmp
- name: storage
  mountPath: /var/www/html/storage
- name: bootstrap-cache
  mountPath: /var/www/html/bootstrap/cache
{{- if .web }}
{{- if .root.Values.persistence.enabled }}
- name: uploads
  mountPath: /var/www/html/storage/app/public
{{- end }}
{{- if .root.Values.customThemes }}
- name: themes
  mountPath: /var/www/html/public/themes-custom
  readOnly: true
{{- end }}
{{- end }}
{{- end -}}

{{- define "eve.volumes" -}}
- name: tmp
  emptyDir: {}
- name: storage
  emptyDir:
    sizeLimit: {{ .root.Values.storageScratch.sizeLimit }}
- name: bootstrap-cache
  emptyDir: {}
{{- if .web }}
{{- if .root.Values.persistence.enabled }}
- name: uploads
  persistentVolumeClaim:
    claimName: {{ .root.Values.persistence.existingClaim | default (printf "%s-uploads" (include "eve.fullname" .root)) }}
{{- end }}
{{- if .root.Values.customThemes }}
- name: themes
  configMap:
    name: {{ include "eve.fullname" .root }}-themes
    items:
      {{- range $name, $_ := .root.Values.customThemes }}
      - key: {{ $name }}.css
        path: {{ $name }}/theme.css
      {{- end }}
{{- end }}
{{- end }}
{{- end -}}
