package com.cadencebudget.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Saves exports via Storage Access Framework (user picks Downloads, Drive folder, etc.).
 * Avoids Capacitor Filesystem JNI for exports, which was crashing the WebView on some devices.
 */
@CapacitorPlugin(name = "SaveExport")
public class SaveExportPlugin extends Plugin {

    private static final String CB_SAVE_PICKED = "saveLocationPicked";

    private OutputStream exportStream;

    @PluginMethod
    public void openSaveLocation(PluginCall call) {
        if (exportStream != null) {
            silentCloseStream();
        }
        String mime = call.getString("mimeType", "application/octet-stream");
        String filename = call.getString("filename", "export.bin");
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(call, intent, CB_SAVE_PICKED);
    }

    @ActivityCallback
    private void saveLocationPicked(PluginCall call, ActivityResult result) {
        if (exportStream != null) {
            silentCloseStream();
        }
        if (result.getResultCode() != Activity.RESULT_OK) {
            call.reject("canceled", "Save canceled");
            return;
        }
        Intent data = result.getData();
        if (data == null) {
            call.reject("no_data", "No document chosen");
            return;
        }
        Uri uri = data.getData();
        if (uri == null) {
            call.reject("no_uri", "No document URI");
            return;
        }
        try {
            exportStream = getContext().getContentResolver().openOutputStream(uri);
            if (exportStream == null) {
                call.reject("open_failed", "Could not open that location for writing");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("ok", true);
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("io_error", e.getMessage(), e);
        }
    }

    @PluginMethod
    public void appendUtf8(PluginCall call) {
        String chunk = call.getString("chunk");
        if (chunk == null) {
            chunk = "";
        }
        OutputStream out = exportStream;
        if (out == null) {
            call.reject("not_open", "No save in progress");
            return;
        }
        try {
            out.write(chunk.getBytes(StandardCharsets.UTF_8));
            call.resolve();
        } catch (IOException e) {
            call.reject("write_error", e.getMessage(), e);
        }
    }

    @PluginMethod
    public void appendBase64(PluginCall call) {
        String chunk = call.getString("chunk");
        if (chunk == null) {
            chunk = "";
        }
        OutputStream out = exportStream;
        if (out == null) {
            call.reject("not_open", "No save in progress");
            return;
        }
        try {
            byte[] decoded = android.util.Base64.decode(chunk, android.util.Base64.DEFAULT);
            out.write(decoded);
            call.resolve();
        } catch (Exception e) {
            call.reject("write_error", e.getMessage(), e);
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        try {
            if (exportStream != null) {
                exportStream.flush();
                exportStream.close();
            }
        } catch (IOException ignored) {
        } finally {
            exportStream = null;
        }
        call.resolve();
    }

    private void silentCloseStream() {
        try {
            if (exportStream != null) {
                exportStream.close();
            }
        } catch (IOException ignored) {
        }
        exportStream = null;
    }

    @Override
    protected void handleOnDestroy() {
        silentCloseStream();
        super.handleOnDestroy();
    }
}
