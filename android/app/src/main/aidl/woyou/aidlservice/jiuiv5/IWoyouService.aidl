package woyou.aidlservice.jiuiv5;

import woyou.aidlservice.jiuiv5.ICallback;

/**
 * Sunmi inner printer AIDL — v5 (woyou.jiuiv5).
 * Method ORDER is critical: the transaction ID is position-based.
 * Do not reorder or remove entries; only add to the end.
 */
interface IWoyouService {
    void printerInit(in ICallback callback);
    void printerSelfChecking(in ICallback callback);
    String getPrinterSerialNo();
    String getPrinterModel();
    String getPrinterVersion();
    int updateFirmware();
    int getFirmwareStatus();
    String getServiceVersion();
    void printText(in String text, in ICallback callback);
    void printTextWithFont(in String text, in String typeface, in float fontSp, in ICallback callback);
    void printRow(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, in ICallback callback);
    void printBitmap(in android.graphics.Bitmap bitmap, in ICallback callback);
    void printBitmapCustom(in android.graphics.Bitmap bitmap, in int type, in ICallback callback);
    void lineWrap(in int lines, in ICallback callback);
    void rawData(in byte[] data, in ICallback callback);
    void cutPaper(in ICallback callback);
    int getCutPaperTimes();
    void openDrawer(in ICallback callback);
    int getOpenDrawerTimes();
    void setPrinterStyle(in int key, in int value, in ICallback callback);
    void getPrinterMode();
    boolean isLcdExist();
    void setAlignment(in int alignment, in ICallback callback);
    void setFontSize(in float fontSp, in ICallback callback);
    void printBarCode(in String data, in int symbology, in int height, in int width, in int textPosition, in ICallback callback);
    void printQRCode(in String data, in int moduleSize, in int errorLevel, in ICallback callback);
    void printOriginalText(in String text, in ICallback callback);
    void printColumnsText(in String[] colsTextArr, in int[] colsWidthArr, in int[] colsAlign, in ICallback callback);
    void autoOutPaper(in int mode, in ICallback callback);
    void setVoltageLevel(in int level, in ICallback callback);
    void setFontName(in String typeface, in ICallback callback);
    void getPaperWidth();
    void getHardwareVersion();
    void getLcdSoftVersion();
    void reLoadFont(in ICallback callback);
    void openLcdDisplay(in int mode, in ICallback callback);
    void sendLcdCommand(in int command, in ICallback callback);
    void sendLcdBitmap(in android.graphics.Bitmap bitmap, in int type, in ICallback callback);
}
