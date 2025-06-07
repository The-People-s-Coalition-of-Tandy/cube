precision mediump float;
attribute vec4 aVertexPosition;
varying vec2 vTextureCoord;

void main() {
    vTextureCoord = (aVertexPosition.xy + 1.0) / 2.0;
    gl_Position = aVertexPosition;
}